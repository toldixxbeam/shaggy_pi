/* Shaggy Moon — dependency-free lunar calculation and web component. */
(function (root) {
  'use strict';
  const RAD = Math.PI / 180, DAY = 86400000, CYCLE = 29.530588853;
  const mod = n => ((n % 360) + 360) % 360;
  const sin = n => Math.sin(n * RAD);
  const names = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
  // Truncated lunar/solar longitude model. Visual/calendar use, not navigation.
  function phaseAt(value = new Date()) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid moon date');
    const d = date.getTime() / DAY + 2440587.5 - 2451545;
    const L = mod(218.3164477 + 13.17639648 * d);
    const M = mod(134.9633964 + 13.06499295 * d);
    const D = mod(297.8501921 + 12.19074912 * d);
    const F = mod(93.272095 + 13.22935024 * d);
    const S = mod(357.5291092 + 0.98560028 * d);
    const sun = mod(280.46646 + 0.98564736 * d + 1.9146 * sin(S) + .019993 * sin(2*S) + .00029 * sin(3*S));
    const moon = mod(L + 6.288774*sin(M) + 1.274027*sin(2*D-M) + .658314*sin(2*D) + .213618*sin(2*M) - .185116*sin(S) - .114332*sin(2*F) + .058793*sin(2*D-2*M) + .057066*sin(2*D-S-M) + .053322*sin(2*D+M) + .045758*sin(2*D-S) - .040923*sin(S-M) - .03472*sin(D) - .030383*sin(S+M) + .015327*sin(2*D-2*F));
    const fraction = mod(moon-sun)/360;
    const index = Math.floor(fraction*8+.5)%8;
    return {date, fraction, index, name:names[index], illumination:(1-Math.cos(fraction*2*Math.PI))/2, waxing:fraction<.5};
  }
  function nextPhase(value, target = 0) {
    const start = new Date(value).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(target) || target<0 || target>=1) throw new RangeError('Invalid phase search');
    let previous = phaseAt(start).fraction;
    let unwrapped = previous;
    const goal = target > previous + 1e-7 ? target : target + 1;
    for (let step=1; step<=64; step++) {
      const end = start + step*DAY/2;
      const p = phaseAt(end).fraction;
      unwrapped += ((p-previous+1)%1); previous=p;
      if(unwrapped>=goal) {
        let low=end-DAY/2, high=end;
        for(let i=0;i<24;i++) {
          const mid=(low+high)/2;
          const delta=((phaseAt(mid).fraction-target+1.5)%1)-.5;
          if(delta<0) low=mid; else high=mid;
        }
        return new Date((low+high)/2);
      }
    }
    throw new Error('Phase not found');
  }
  const API = {phaseAt, nextPhase, names, synodicMonth:CYCLE};
  if(typeof module !== 'undefined' && module.exports) module.exports=API;
  root.ShaggyMoon = API;
  if(!root.customElements || root.customElements.get('shaggy-moon')) return;
  const source = document.currentScript?.src || new URL('moon.js', document.baseURI).href;
  const sprite = new URL('assets/shaggy-actions.webp',source).href;
  const textureURL = new URL('assets/moon-lroc.webp',source).href;
  const routines = [
    [[0,'search','question','Where did I park that moon?'],[5,'scan','beam','Checking the far side…'],[0,'shrug','question','Definitely here a minute ago.']],
    [[1,'cast','line','Casting for a shooting star.'],[1,'fish','star','Something’s nibbling.'],[1,'reel','star','Caught a little moonlight!']],
    [[2,'brace','none','Just needs a little nudge.'],[2,'push','dust','Putting his back into it.'],[4,'settle','spark','That’ll do. Tea break.']],
    [[3,'brush','dust','Sweeping the moon dust.'],[3,'polish','spark','Getting it ready for the big night.'],[0,'inspect','spark','Missed a spot. Naturally.']],
    [[4,'lounge','none','Best seat in the solar system.'],[5,'scan','meteor','Watching the stars go by.'],[4,'stretch','spark','Full moon. Absolutely no plans.']],
    [[5,'scan','beam','Spotting distant constellations.'],[5,'lean','meteor','Was that a shooting star?'],[0,'wonder','spark','Yep. Definitely saw something.']],
    [[6,'doze','sleep','Just resting his eyes.'],[6,'nod','sleep','A very small lunar nap.'],[0,'startle','question','What? I was keeping watch.']],
    [[7,'tug','rope','Holding on to the last sliver.'],[7,'pull','rope','Come on, one more night!'],[1,'fish','star','One last cast before it disappears.']]
  ];
  API.routines=routines;
  let texturePromise;
  function loadTexture(){
    if(!texturePromise)texturePromise=new Promise(resolve=>{
      const img=new Image(); img.crossOrigin='anonymous';
      img.onload=()=>{try{const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);resolve(ctx.getImageData(0,0,c.width,c.height));}catch{resolve(null);}};
      img.onerror=()=>resolve(null);img.src=textureURL;
    });return texturePromise;
  }
  class ShaggyMoon extends HTMLElement {
    static get observedAttributes(){return ['date','phase','hemisphere','hide-label','motion'];}
    constructor(){super();this.attachShadow({mode:'open'});this.beat=0;this.phaseIndex=-1;
      this.shadowRoot.innerHTML=`<style>
      :host{display:block;width:100%;max-width:560px;color:var(--shaggy-text,#f4eedf);font-family:inherit;contain:content}*{box-sizing:border-box}
      .stage{position:relative;aspect-ratio:1;overflow:hidden}canvas{position:absolute;width:72%;height:auto;left:14%;top:25%;filter:drop-shadow(0 0 18px #c7d7e315)}
      .actor{position:absolute;width:42%;aspect-ratio:1;left:29%;top:5%;transform-origin:50% 80%;z-index:2}
      .man{position:absolute;inset:0;background-size:400% 200%;background-repeat:no-repeat;filter:drop-shadow(1px 4px 2px #0006)}
      .search canvas{visibility:hidden}.search .actor{top:17%;width:48%;left:26%}
      .stage[data-pose="2"] .actor{left:5%;top:14%;width:39%}.stage[data-pose="3"] .actor{top:1%;left:29%}.stage[data-pose="4"] .actor{top:8%;left:28%;width:44%}.stage[data-pose="7"] .actor{left:37%;top:9%;width:37%}
      .effect{position:absolute;pointer-events:none;z-index:3;color:#f3dfac;visibility:hidden;opacity:0}.star,.spark,.meteor{font-size:clamp(14px,4vw,24px)}.star{left:72%;top:53%}.spark{left:65%;top:32%}.question{left:73%;top:12%;font:italic 34px Georgia}.sleep{left:64%;top:10%;font:italic 22px Georgia}.dust{left:58%;top:34%;font-size:25px;letter-spacing:4px}.line{left:70%;top:23%;height:32%;width:1px;background:linear-gradient(#dcdacb88,#dcdacb22);transform-origin:top}.rope{left:60%;top:0;height:27%;width:2px;background:repeating-linear-gradient(#c5aa74 0 3px,#6d5a39 3px 5px);transform:rotate(12deg)}.beam{left:64%;top:12%;width:32%;height:16%;background:linear-gradient(90deg,#e7dfb322,transparent);clip-path:polygon(0 45%,100% 0,100% 100%,0 55%);transform-origin:left center}.meteor{left:90%;top:12%;text-shadow:15px -10px 6px #f5e6ba55}
      [data-effect="question"] .question,[data-effect="sleep"] .sleep,[data-effect="dust"] .dust,[data-effect="spark"] .spark,[data-effect="star"] .star,[data-effect="beam"] .beam,[data-effect="meteor"] .meteor,[data-effect="rope"] .rope,[data-effect="line"] .line{visibility:visible;opacity:1}
      [data-motion="search"] .actor{animation:search 6s ease-in-out infinite}[data-motion="shrug"] .actor{animation:shrug 6s ease-in-out infinite}[data-motion="scan"] .actor{animation:scan 6s ease-in-out infinite}[data-motion="cast"] .actor{animation:cast 6s ease-in-out infinite}[data-motion="fish"] .actor{animation:fish 6s ease-in-out infinite}[data-motion="reel"] .actor{animation:reel 6s ease-in-out infinite}[data-motion="brace"] .actor{animation:brace 6s ease-in-out infinite}[data-motion="push"] .actor{animation:push 6s ease-in-out infinite}[data-motion="settle"] .actor{animation:settle 6s ease-in-out infinite}[data-motion="brush"] .actor{animation:brush 2s ease-in-out infinite}[data-motion="polish"] .actor{animation:polish 3s ease-in-out infinite}[data-motion="inspect"] .actor{animation:lean 6s ease-in-out infinite}[data-motion="lounge"] .actor{animation:lounge 6s ease-in-out infinite}[data-motion="stretch"] .actor{animation:stretch 6s ease-in-out infinite}[data-motion="lean"] .actor{animation:lean 6s ease-in-out infinite}[data-motion="wonder"] .actor{animation:wonder 6s ease-in-out infinite}[data-motion="doze"] .actor{animation:doze 6s ease-in-out infinite}[data-motion="nod"] .actor{animation:nod 6s ease-in-out infinite}[data-motion="startle"] .actor{animation:startle 6s ease-in-out infinite}[data-motion="tug"] .actor{animation:tug 3s ease-in-out infinite}[data-motion="pull"] .actor{animation:pull 6s ease-in-out infinite}
      [data-motion="push"] canvas{animation:moonPush 6s ease-in-out infinite}[data-motion="tug"] canvas,[data-motion="pull"] canvas{animation:moonTug 6s ease-in-out infinite}
      .question{animation:question 3s ease-in-out infinite}.sleep{animation:sleep 3s ease-out infinite}.dust{animation:dust 2s ease-out infinite}.spark{animation:spark 2s ease-out infinite}.star{animation:catchStar 6s ease-in-out infinite}.meteor{animation:meteor 6s ease-out infinite}.beam{animation:beam 6s ease-in-out infinite}.line{animation:line 6s ease-in-out infinite}
      .label{text-align:center;padding:3px 8px var(--shaggy-label-padding,14px)}.name{font:400 var(--shaggy-phase-size,clamp(23px,5vw,32px)) Georgia,serif;margin:0 0 var(--shaggy-phase-gap,8px)}.detail{font:10px system-ui;letter-spacing:.14em;text-transform:uppercase;opacity:.65;line-height:1.8}.action{font:italic var(--shaggy-action-size,13px)/1.5 Georgia;color:var(--shaggy-accent,#d9c89f);margin-top:var(--shaggy-action-gap,8px);min-height:20px}:host([hide-label]) .label{display:none}:host([motion="off"]) *{animation:none!important}
      @keyframes search{0%,100%{transform:rotate(-5deg)}50%{transform:translateY(-7px) rotate(5deg)}}@keyframes shrug{30%,60%{transform:translateY(-8px) rotate(-3deg)}}@keyframes scan{0%,100%{transform:rotate(-7deg)}50%{transform:rotate(7deg)}}@keyframes cast{0%,100%{transform:rotate(0)}25%{transform:rotate(-15deg)}40%{transform:rotate(9deg)}55%{transform:rotate(0)}}@keyframes fish{50%{transform:translateY(3px) rotate(2deg)}}@keyframes reel{0%,100%{transform:rotate(0)}25%,55%{transform:translate(-6px,-4px) rotate(-10deg)}40%,70%{transform:rotate(4deg)}}@keyframes brace{40%,70%{transform:translateX(5px) rotate(5deg)}}@keyframes push{20%,50%{transform:translateX(13px) rotate(8deg)}35%,65%{transform:translateX(3px)}}@keyframes settle{0%{transform:translateY(-12px)}20%{transform:translateY(3px)}35%,100%{transform:translateY(0)}}@keyframes brush{50%{transform:translate(7px,2px) rotate(4deg)}}@keyframes polish{25%{transform:translateX(5px) rotate(3deg)}75%{transform:translateX(-3px) rotate(-2deg)}}@keyframes lounge{50%{transform:translateY(-3px) rotate(2deg)}}@keyframes stretch{40%,70%{transform:rotate(-6deg) scale(1.04)}}@keyframes lean{40%,70%{transform:translateX(9px) rotate(9deg)}}@keyframes wonder{50%{transform:translateY(-5px) rotate(-5deg)}}@keyframes doze{50%{transform:rotate(5deg) translateY(3px)}}@keyframes nod{40%{transform:rotate(10deg) translateY(7px)}46%{transform:rotate(-3deg)}65%{transform:rotate(4deg)}}@keyframes startle{0%,100%{transform:translateY(0)}10%{transform:translateY(-18px) rotate(-8deg)}20%{transform:translateY(2px)}40%{transform:rotate(5deg)}}@keyframes tug{50%{transform:translate(-7px,9px) rotate(-8deg)}}@keyframes pull{30%,60%{transform:translate(-13px,12px) rotate(-13deg)}45%{transform:translate(3px,-5px)}}@keyframes moonPush{25%,55%{transform:translateX(5px) rotate(2deg)}}@keyframes moonTug{40%,70%{transform:rotate(-2deg) translateY(-3px)}}@keyframes question{50%{opacity:.4;transform:translateY(-6px)}}@keyframes sleep{0%{opacity:0;transform:translate(0,12px) scale(.7)}35%{opacity:1}100%{opacity:0;transform:translate(15px,-20px) scale(1.15)}}@keyframes dust{0%{opacity:0;transform:translate(0,0)}25%{opacity:.7}100%{opacity:0;transform:translate(25px,-12px)}}@keyframes spark{0%,100%{opacity:0;transform:scale(.3)}45%{opacity:1;transform:scale(1.3) rotate(20deg)}}@keyframes catchStar{0%,25%{opacity:0;transform:translateY(30px)}50%{opacity:1;transform:translateY(0)}80%{opacity:1;transform:translate(-40px,-55px) rotate(50deg)}100%{opacity:0;transform:translate(-40px,-55px)}}@keyframes meteor{0%,60%,100%{opacity:0}65%{opacity:1;transform:translate(0,0)}85%{opacity:0;transform:translate(-160px,80px)}}@keyframes beam{50%{transform:rotate(-15deg);opacity:.6}}@keyframes line{0%,20%{transform:rotate(-30deg) scaleY(.2);opacity:0}40%,100%{transform:rotate(0) scaleY(1);opacity:1}}
      @media(prefers-reduced-motion:reduce){*{animation:none!important}}
      </style><div class="stage" role="img"><canvas width="480" height="480" aria-hidden="true"></canvas><div class="actor" aria-hidden="true"><div class="man"></div></div><span class="effect question" aria-hidden="true">?</span><span class="effect sleep" aria-hidden="true">z z Z</span><span class="effect dust" aria-hidden="true">· ˙ ·</span><span class="effect spark" aria-hidden="true">✧</span><span class="effect star" aria-hidden="true">✦</span><span class="effect meteor" aria-hidden="true">✦</span><span class="effect line" aria-hidden="true"></span><span class="effect rope" aria-hidden="true"></span><span class="effect beam" aria-hidden="true"></span></div><div class="label"><p class="name"></p><div class="detail"></div><div class="action"></div></div>`;
      this.shadowRoot.querySelector('.man').style.backgroundImage=`url("${sprite}")`;
      this.media=root.matchMedia?.('(prefers-reduced-motion: reduce)');
      this.onMotion=()=>this.startActions();this.onVisibility=()=>this.startActions();
    }
    connectedCallback(){this.render();this.timer=setInterval(()=>{if(!this.hasAttribute('date')&&!this.hasAttribute('phase'))this.render();},60000);this.media?.addEventListener('change',this.onMotion);document.addEventListener('visibilitychange',this.onVisibility);loadTexture().then(t=>{this.texture=t;if(this.isConnected&&this.currentPhase!==undefined)this.draw(this.currentPhase)});this.startActions();}
    disconnectedCallback(){clearInterval(this.timer);clearInterval(this.actionTimer);this.media?.removeEventListener('change',this.onMotion);document.removeEventListener('visibilitychange',this.onVisibility);}
    attributeChangedCallback(name){if(this.isConnected){this.render();if(name==='motion')this.startActions();}}
    startActions(){clearInterval(this.actionTimer);if(this.getAttribute('motion')==='off'||this.media?.matches||document.hidden||!this.isConnected)return;this.actionTimer=setInterval(()=>this.nextAction(),6000);}
    nextAction(){if(this.phaseIndex<0)return;this.beat=(this.beat+1)%3;this.applyAction();}
    applyAction(){if(this.phaseIndex<0)return;const [pose,motion,effect,caption]=routines[this.phaseIndex][this.beat],stage=this.shadowRoot.querySelector('.stage');stage.dataset.pose=pose;stage.dataset.motion=motion;stage.dataset.effect=effect;this.shadowRoot.querySelector('.man').style.backgroundPosition=`${(pose%4)*100/3}% ${pose<4?0:100}%`;this.shadowRoot.querySelector('.action').textContent=caption;stage.setAttribute('aria-label',`${names[this.phaseIndex]}: ${this.phaseIndex===0?'Shaggy searches for the missing moon.':caption}`);this.dispatchEvent(new CustomEvent('actionchange',{detail:{phase:this.phaseIndex,beat:this.beat,caption},bubbles:true,composed:true}));}
    render(){
      let p;try{p=phaseAt(this.getAttribute('date')||new Date());}catch{this.invalid('Invalid date','Use an ISO date, such as 2026-11-15');return;}
      const preview=this.getAttribute('phase');
      if(preview!==null){const n=Number(preview);if(!Number.isFinite(n)||n<0||n>=1){this.invalid('Invalid phase','Use a number from 0 up to (but not including) 1');return;}p={...p,fraction:n,index:Math.floor(n*8+.5)%8,illumination:(1-Math.cos(n*2*Math.PI))/2,waxing:n<.5};p.name=names[p.index];}
      const stage=this.shadowRoot.querySelector('.stage');stage.style.display='';stage.classList.toggle('search',p.index===0);
      if(this.phaseIndex!==p.index){this.phaseIndex=p.index;this.beat=0;this.startActions();}this.applyAction();
      this.shadowRoot.querySelector('.name').textContent=p.name;this.shadowRoot.querySelector('.detail').textContent=`${Math.round(p.illumination*100)}% illuminated · ${preview!==null?'phase preview':p.date.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})}`;
      this.currentPhase=p.fraction;this.draw(p.fraction);this.dispatchEvent(new CustomEvent('phasechange',{detail:p,bubbles:true,composed:true}));
    }
    invalid(title,detail){this.phaseIndex=-1;this.currentPhase=undefined;clearInterval(this.actionTimer);this.shadowRoot.querySelector('.name').textContent=title;this.shadowRoot.querySelector('.detail').textContent=detail;this.shadowRoot.querySelector('.action').textContent='';this.shadowRoot.querySelector('.stage').style.display='none';}
    draw(phase){
      const canvas=this.shadowRoot.querySelector('canvas'),ctx=canvas.getContext('2d');if(!ctx)return;const n=canvas.width,r=n/2-2,im=ctx.createImageData(n,n),angle=phase*2*Math.PI,south=this.getAttribute('hemisphere')==='south',lx=Math.sin(angle),lz=-Math.cos(angle),t=this.texture;
      for(let y=0;y<n;y++)for(let x=0;x<n;x++){
        let nx=(x-n/2)/r,ny=(y-n/2)/r;const rr=nx*nx+ny*ny;if(rr>1)continue;if(south){nx=-nx;ny=-ny;}const z=Math.sqrt(1-rr),mu=nx*lx+z*lz;
        let color=[155,155,153];if(t){const u=.5+Math.atan2(nx,z)/(2*Math.PI),v=.5+Math.asin(ny)/Math.PI,tx=Math.min(t.width-1,Math.floor(u*t.width)),ty=Math.min(t.height-1,Math.floor(v*t.height)),ti=(ty*t.width+tx)*4;color=[t.data[ti],t.data[ti+1],t.data[ti+2]];}
        const lit=Math.max(0,mu),edge=Math.min(1,Math.max(0,(mu+.009)/.018));const brightness=.022+(Math.min(1.32,.22+1.1*Math.sqrt(lit/(z+.15))))*edge;const i=(y*n+x)*4;
        for(let c=0;c<3;c++)im.data[i+c]=Math.min(255,color[c]*brightness*.92);im.data[i+3]=Math.min(255,(1-Math.sqrt(rr))*r*255);
      }ctx.putImageData(im,0,0);
    }
  }
  root.customElements.define('shaggy-moon',ShaggyMoon);
})(typeof window!=='undefined'?window:globalThis);
