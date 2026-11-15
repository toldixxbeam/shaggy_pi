'use strict';

(() => {
  const zone = 'Europe/Amsterdam';
  const todayDate = new Intl.DateTimeFormat('en-CA', {timeZone:zone, year:'numeric', month:'2-digit', day:'2-digit'});
  const timeOfDay = new Intl.DateTimeFormat('en-GB', {timeZone:zone, hour:'2-digit', minute:'2-digit'});
  const monthName = new Intl.DateTimeFormat('en-GB', {timeZone:'UTC', month:'long', year:'numeric'});
  const dateName = new Intl.DateTimeFormat('en-GB', {timeZone:'UTC', weekday:'long', day:'numeric', month:'long'});
  const parseDay = key => new Date(key + 'T12:00:00Z');

  function currentDay() {
    const parts = Object.fromEntries(todayDate.formatToParts(new Date()).map(part => [part.type,part.value]));
    return [parts.year,parts.month,parts.day].join('-');
  }

  function plusDays(key, count) {
    const date = parseDay(key);
    date.setUTCDate(date.getUTCDate() + count);
    return date.toISOString().slice(0,10);
  }

  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function tint(el, source) {
    if ([0,1,2].includes(source)) el.style.setProperty('--event-color', 'var(--source-' + source + ')');
    return el;
  }

  function heading(label, eyebrow, month = false) {
    const header = make('header', 'display-header');
    const group = make('div');
    if (eyebrow) group.append(make('p','display-eyebrow',eyebrow));
    group.append(make(month ? 'h1' : 'h2','',label));
    header.append(group);
    return header;
  }

  function clock() {
    const value = make('time','display-clock',timeOfDay.format(new Date()));
    value.dataset.displayClock = '';
    return value;
  }

  function eventTime(event, day) {
    if (event.all_day) return 'All day';
    if (event.first_day < day) return event.last_day === day && event.end ? 'Until '+timeOfDay.format(new Date(event.end)) : 'Ongoing';
    return event.start ? timeOfDay.format(new Date(event.start)) : '';
  }

  function byStart(a,b) {
    return Number(b.all_day) - Number(a.all_day) || (a.start && b.start ? Date.parse(a.start) - Date.parse(b.start) : 0)
      || a.title.localeCompare(b.title);
  }

  function kitchen(data, compact) {
    const today = data?.today || currentDay();
    const date = parseDay(today);
    const month = today.slice(0,7);
    const first = month + '-01';
    const weekday = (parseDay(first).getUTCDay()+6)%7;
    const start = data?.start || plusDays(first,-weekday);
    const length = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
    const weeks = Math.ceil((weekday+length)/7);
    const events = [...(data?.events || [])].sort(byStart);
    const sources = data?.sources || [];
    const root = make('div','display-kitchen');
    const calendar = make('section','display-panel display-month');
    const calendarHeader = heading(monthName.format(date),'',true);
    const legend = make('div','display-legend');
    for (const source of sources) {
      const label = tint(make('span'),source.index);
      label.append(make('i','display-dot'),document.createTextNode(source.label));
      legend.append(label);
    }
    calendarHeader.append(legend);
    const week = make('div','display-week');
    for (const label of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']) week.append(make('span','',label));
    const days = make('div','display-days');
    days.style.setProperty('--weeks',weeks);
    for (let index=0;index<7*weeks;index++) {
      const day = plusDays(start,index);
      const cell = make('div','display-cell' + (day.startsWith(month)?'':' outside') + (day===today?' current':''));
      cell.append(make('time','display-date',parseDay(day).getUTCDate()));
      const scheduled = events.filter(event => event.first_day<=day && event.last_day>=day);
      const limit = compact || weeks===6 ? 2 : 3;
      for (const event of scheduled.slice(0,limit)) {
        const startTime = event.first_day===day && !event.all_day ? eventTime(event,day)+' ' : '';
        const label = tint(make('div','display-event',startTime+event.title),event.source);
        label.title = event.title;
        cell.append(label);
      }
      if (scheduled.length>limit) cell.append(make('div','display-more','+'+(scheduled.length-limit)+' more'));
      days.append(cell);
    }
    calendar.append(calendarHeader,week,days);

    const datePanel = make('section','display-panel display-day');
    const dayHeader = heading(dateName.format(date),'Today');
    dayHeader.append(clock());
    datePanel.append(dayHeader);
    const todaysEvents = events.filter(event => event.first_day<=today && event.last_day>=today);
    const agenda = make('ul','display-agenda'+(todaysEvents.length>9?' dense':''));
    const limit = compact?12:17;
    for (const event of todaysEvents.slice(0,limit)) {
      const row = tint(make('li'),event.source);
      const title = make('div','display-agenda-title');
      title.title = event.title;
      title.append(make('i','display-dot'),document.createTextNode(event.title));
      row.append(make('time','display-agenda-time',eventTime(event,today)),title);
      agenda.append(row);
    }
    if (todaysEvents.length) datePanel.append(agenda);
    else if (sources.some(s => ['ready','busy_only'].includes(s.status))) datePanel.append(make('p','display-day-empty','No events today.'));
    if (todaysEvents.length>limit) datePanel.append(make('p','display-day-empty','+'+(todaysEvents.length-limit)+' more today'));

    const unavailable = sources.filter(s=>s.status==='unavailable').map(s=>s.label);
    const busyOnly = sources.filter(s=>s.status==='busy_only').map(s=>s.label);
    let status = !data || data.status==='loading'?'Loading calendars…':data.status==='unavailable'?'Calendar data unavailable.':'';
    if (sources.some(s=>s.status==='connect')) status = 'Connect Google Calendar in AI settings.';
    if (unavailable.length) status = 'Check Google Calendar sharing for '+unavailable.join(', ')+'.';
    if (busyOnly.length) status = [status,'Free/busy only for '+busyOnly.join(', ')+'.'].filter(Boolean).join(' ');
    if (status) datePanel.append(make('p','display-calendar-status',status));
    root.append(calendar,datePanel);
    return root;
  }

  function productRows(items) {
    const list = make('ul','display-grocery-products');
    for (const item of items) {
      const row = make('li');
      const name = make('span','',item.name);
      name.title = item.name;
      row.append(make('span','display-grocery-quantity',item.quantity===null?'':item.quantity+' ×'),name,make('span','',item.price||''));
      list.append(row);
    }
    return list;
  }

  function groceries(data, index, compact, changePage) {
    const root = make('div','display-groceries');
    const cart = make('section','display-panel');
    const orders = make('section','display-panel');
    const cartData = data?.cart;
    const upcoming = data?.upcoming;
    const cartHeading = heading(cartData?.editing?'Current order edit':'Current cart','Jumbo');
    if (cartData?.total) cartHeading.append(make('div','display-clock',cartData.total));
    cart.append(cartHeading);
    orders.append(heading('Upcoming orders','Jumbo'));
    const perPage = compact ? 15 : 20;
    const pager = (part, count) => {
      if (count<2) return;
      const counter = make('div','display-grocery-page', 'Page '+(index%count+1)+' of '+count);
      if (changePage) {
        for (const [label,offset] of [['‹',-1],['›',1]]) {
          const button = make('button','',label);
          button.type = 'button';
          button.setAttribute('aria-label', offset<0?'Previous groceries page':'Next groceries page');
          button.addEventListener('click',()=>changePage(offset,count));
          counter.append(button);
        }
      }
      part.append(counter);
    };
    const pending = data?.status==='browser_busy'?'Waiting for the browser to be free.':
      data?.status==='unavailable'?'Jumbo is unavailable.':'Checking Jumbo…';
    if (cartData?.status==='ready') {
      const count = Math.max(1,Math.ceil(cartData.items.length/perPage));
      const start = index%count*perPage;
      if (cartData.items.length) cart.append(productRows(cartData.items.slice(start,start+perPage)));
      else cart.append(make('p','display-day-empty','Your cart is empty.'));
      pager(cart,count);
    } else {
      const status = cartData?.status==='sign_in'?'Sign in to Jumbo in Shaggy’s browser.':cartData?'Cart contents unavailable.':pending;
      cart.append(make('p','display-day-empty',status));
    }

    if (upcoming?.status==='sign_in') orders.append(make('p','display-day-empty','Sign in to Jumbo in Shaggy’s browser.'));
    else if (upcoming?.status==='ready' || upcoming?.status==='partial') {
      const pages = upcoming.orders.flatMap(order => {
        if (!order.items.length) return [{order, items:[]}];
        return Array.from({length:Math.ceil(order.items.length/perPage)}, (_,i)=>({order,items:order.items.slice(i*perPage,(i+1)*perPage)}));
      });
      const display = pages[index%pages.length];
      if (display) {
        orders.append(make('h3','',display.order.label));
        if (display.items.length) orders.append(productRows(display.items));
        else orders.append(make('p','display-day-empty','Order items unavailable.'));
        pager(orders,pages.length);
      } else orders.append(make('p','display-day-empty',upcoming.status==='ready'?'No upcoming orders.':'Upcoming orders could not be verified.'));
    } else orders.append(make('p','display-day-empty',upcoming?'Upcoming orders unavailable.':pending));
    root.append(cart,orders);
    return root;
  }

  function chat(data) {
    const panel = make('section','display-panel display-chat');
    panel.append(heading(data?.conversation?.title||'Shaggy','Current conversation'));
    const messages = make('div','display-chat-body');
    for (const item of data?.messages || []) {
      const text = item.text || (item.status==='running'?item.activity||'Working…':'');
      if (!text) continue;
      const bubble = make('div','display-bubble '+item.role);
      bubble.append(make('strong','',item.role==='user'?'Marlon':'Shaggy'),make('p','',text));
      messages.append(bubble);
    }
    if (!messages.children.length) messages.append(make('p','display-day-empty','Open a chat on the Shaggy dashboard.'));
    panel.append(messages);
    return panel;
  }

  async function get(url) {
    const response = await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(5500)});
    if (!response.ok) throw Error('Display data unavailable');
    return response;
  }

  function mount(root, fixedMode = null) {
    const kiosk = fixedMode===null;
    const audio = kiosk ? new Audio() : null;
    let mode, fingerprint, frameUrl, seenReplies, groceryPage=0, lastPage=0;
    let kitchenPoll=0, configPoll=0, stopped=false;
    let model=null;
    const changeMode = next => {
      if (next===mode) return;
      mode=next;
      root.dataset.screen=mode;
      model=null;
      fingerprint=null;
      kitchenPoll=0;
      configPoll=0;
      groceryPage=0;
      lastPage=0;
      seenReplies=null;
      if (audio) {audio.pause();audio.removeAttribute('src');audio.load();}
      if (frameUrl) {URL.revokeObjectURL(frameUrl);frameUrl=null;}
      root.replaceChildren();
    };

    async function playReply(data) {
      if (!audio) return;
      const replies = data.messages.filter(m=>m.role==='assistant' && ['done','needs_input','blocked'].includes(m.status) && m.text);
      const keys = replies.map(m=>m.id);
      if (!seenReplies || seenReplies.chat!==data.conversation?.id) {
        const earlier = replies.filter(m=>Date.now()-m.created*1000>12000).map(m=>m.id);
        seenReplies={chat:data.conversation?.id,keys:new Set(earlier)};
      }
      const reply = replies.findLast(m=>!seenReplies.keys.has(m.id));
      seenReplies.keys = new Set(keys);
      if (!reply) return;
      audio.src='/api/screen/voice?id='+encodeURIComponent(reply.id);
      try {await audio.play();} catch { /* The transcript remains visible if the speaker is unavailable. */ }
    }

    function paint(data, force = false) {
      const signature=JSON.stringify([data,groceryPage]);
      if (!force && signature===fingerprint) return;
      fingerprint=signature;
      const compact=root.clientHeight<750 || root.clientWidth<1050;
      if (mode==='Kitchen') root.replaceChildren(kitchen(data,compact));
      if (mode==='Groceries') root.replaceChildren(groceries(data,groceryPage,compact,kiosk?null:(offset,count)=>{
        groceryPage=(groceryPage+offset+count)%count;
        paint(model,true);
      }));
      if (mode==='Agent') {
        root.replaceChildren(chat(data));
        const body=root.querySelector('.display-chat-body');
        body.scrollTop=body.scrollHeight;
        if (data) void playReply(data);
      }
      if (mode==='Photos') root.replaceChildren(make('div','display-screen-center display-photo','Photo source not selected.'));
    }

    async function update() {
      if (stopped) return;
      try {
        if (!kiosk && root.getClientRects().length===0) return;
        if (kiosk && Date.now()>=configPoll) {
          configPoll=Date.now()+2000;
          const config=await (await get('/api/display')).json();
          if (!stopped) changeMode(config.mode);
        }
        for (const value of root.querySelectorAll('[data-display-clock]')) value.textContent=timeOfDay.format(new Date());
        if (mode==='Kitchen' && Date.now()>=kitchenPoll) {
          model=await (await get('/api/screen/kitchen')).json();
          kitchenPoll=Date.now()+(model.status==='ready'?10000:2200);
          if (!stopped) paint(model);
        } else if (mode==='Groceries') {
          if (kiosk && Date.now()-lastPage>=16000) {
            if (lastPage) groceryPage++;
            lastPage=Date.now();
          }
          model=await (await get('/api/screen/groceries')).json();
          if (!stopped) paint(model);
        } else if (mode==='Agent') {
          model=await (await get('/api/screen/chat')).json();
          if (!stopped) paint(model);
        } else if (mode==='Photos') {
          paint(null);
        } else if (mode==='Browser') {
          const response=await get('/api/screen/browser');
          if (stopped) return;
          if (!response.headers.get('Content-Type')?.startsWith('image/')) {
            if (frameUrl) {URL.revokeObjectURL(frameUrl);frameUrl=null;}
            if (!root.querySelector('.display-screen-center')) root.replaceChildren(make('div','display-screen-center','Waiting for Shaggy to use the browser…'));
          } else {
            const blob=await response.blob();
            if (stopped) return;
            const next=URL.createObjectURL(blob);
            let img=root.querySelector('.display-browser img');
            if (!img) {
              const frame=make('div','display-browser');
              img=make('img');
              img.alt='Live Shaggy browser';
              frame.append(img);
              root.replaceChildren(frame);
            }
            img.src=next;
            if (frameUrl) URL.revokeObjectURL(frameUrl);
            frameUrl=next;
          }
        }
      } catch {
        if (!stopped && !root.children.length) root.replaceChildren(make('div','display-screen-center','Display data unavailable.'));
      } finally {
        if (!stopped) setTimeout(update, mode==='Browser'?1100:1700);
      }
    }
    changeMode(fixedMode || 'Kitchen');
    if (mode==='Kitchen') paint(null);
    void update();
    return () => {
      stopped=true;
      if (audio) {audio.pause();audio.removeAttribute('src');audio.load();}
      if (frameUrl) URL.revokeObjectURL(frameUrl);
    };
  }

  window.mountShaggyDisplay = mount;
  const kiosk = document.querySelector('[data-kiosk]');
  if (kiosk) mount(kiosk);
})();
