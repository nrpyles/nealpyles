/* Progressive enhancement: the DFW guide and application work without JavaScript. */
(function () {
  'use strict';
  var hero = document.querySelector('.texas-hero');
  if (!hero) return;
  var tabs = Array.from(hero.querySelectorAll('[role="tab"]'));
  var panels = Array.from(hero.querySelectorAll('[role="tabpanel"]'));
  var pins = Array.from(hero.querySelectorAll('.hub-pin'));
  var route = document.getElementById('hub-route');
  var coordinates = document.getElementById('hub-coordinate');
  var map = hero.querySelector('.texas-map');
  var reset = document.getElementById('map-reset');
  var mapLabel = document.getElementById('map-caption-label');
  var mapTitle = document.getElementById('map-caption-title');
  var mapInstruction = document.getElementById('map-instruction');
  var mapSummary = document.getElementById('hub-zoom-summary');
  var mapFact = document.getElementById('hub-zoom-fact');
  var mapFactLink = document.getElementById('hub-zoom-link');
  var localGroups = Array.from(hero.querySelectorAll('.atlas-local-group'));
  var zoomFrame = null;
  var zoomTarget = 'state';
  var stateView = [0, 0, 560, 510];
  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var selected = 'dfw';
  var hubs = {
    dfw: { coordinates: '32.78° N / 96.80° W', route: 'M341 278 Q335 223 373 173', view: [300, 105, 165, 150], title: 'Dallas–Fort Worth' },
    houston: { coordinates: '29.76° N / 95.37° W', route: 'M373 173 Q400 220 422 300', view: [360, 235, 137, 125], title: 'Houston & nearby' },
    austin: { coordinates: '30.27° N / 97.74° W', route: 'M373 173 Q335 223 341 278', view: [282, 214, 115, 105], title: 'Austin & nearby' },
    'san-antonio': { coordinates: '29.42° N / 98.49° W', route: 'M373 173 Q330 230 316 314', view: [260, 247, 130, 118], title: 'San Antonio & nearby' },
    'el-paso': { coordinates: '31.76° N / 106.49° W', route: 'M373 173 Q210 130 44 215', view: [4, 152, 148, 135], title: 'El Paso & nearby' }
  };
  // Keep label size and tap targets readable while the SVG camera zooms.
  var labels = Array.from(map.querySelectorAll('.hub-pin text, .local-map-place text'));
  labels.forEach(function (label) {
    label.dataset.offsetX = label.getAttribute('x');
    label.dataset.offsetY = label.getAttribute('y');
  });
  function drawView(view) {
    map.setAttribute('viewBox', view.map(function (n) { return n.toFixed(3); }).join(' '));
    var padding = getComputedStyle(map);
    var width = map.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight);
    var height = map.clientHeight - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom);
    var pixelsPerUnit = Math.max(.01, Math.min(width / view[2], height / view[3]));
    var scale = 1 / pixelsPerUnit;
    map.style.setProperty('--map-scale', scale);
    labels.forEach(function (label) {
      label.setAttribute('x', Number(label.dataset.offsetX) * scale);
      label.setAttribute('y', Number(label.dataset.offsetY) * scale);
    });
  }
  function zoomTo(id) {
    if (zoomFrame !== null) cancelAnimationFrame(zoomFrame);
    zoomTarget = id;
    var target = id === 'state' ? stateView : hubs[id].view;
    var start = map.getAttribute('viewBox').split(/\s+/).map(Number);
    reset.hidden = id === 'state';
    mapSummary.hidden = id === 'state';
    if (id !== 'state') {
      mapFact.textContent = document.querySelector('#panel-' + id + ' .hub-discover > p:not(.atlas-kicker)').textContent;
      mapFactLink.href = '#panel-' + id;
    }
    map.classList.toggle('is-zoomed', id !== 'state');
    mapLabel.textContent = id === 'state' ? 'A place for your next chapter' : 'Your region, up close';
    mapTitle.textContent = id === 'state' ? 'Where feels like home?' : hubs[id].title;
    // Only expose the current pin to keyboard users when the others are off-screen.
    pins.forEach(function (pin) {
      var visible = id === 'state' || pin.dataset.hub === id;
      pin.classList.toggle('is-offscreen', !visible);
      pin.tabIndex = visible ? 0 : -1;
      pin.setAttribute('aria-hidden', String(!visible));
      pin.querySelector('text').textContent = id !== 'state' && pin.dataset.hub === 'dfw' ? 'DALLAS' : pin.dataset.hub === 'dfw' ? 'DFW' : pin.dataset.hub.replace('-', ' ').toUpperCase();
    });
    localGroups.forEach(function (group) { group.classList.toggle('is-visible', group.dataset.region === id); });
    if (motion.matches) {
      drawView(target);
      map.dataset.zoom = id;
      zoomFrame = null;
      return;
    }
    map.dataset.zoom = 'transitioning';
    var began = null;
    function frame(now) {
      if (began === null) began = now;
      var progress = Math.min(1, (now - began) / 850);
      var eased = 1 - Math.pow(1 - progress, 4);
      drawView(start.map(function (n, i) { return n + (target[i] - n) * eased; }));
      if (progress < 1) zoomFrame = requestAnimationFrame(frame);
      else { map.dataset.zoom = id; zoomFrame = null; }
    }
    zoomFrame = requestAnimationFrame(frame);
  }
  drawView(stateView);
  new ResizeObserver(function () {
    drawView(map.getAttribute('viewBox').split(/\s+/).map(Number));
  }).observe(map);
  reset.addEventListener('click', function () {
    zoomTo('state');
    coordinates.textContent = '5 hubs · Statewide lending';
    mapInstruction.firstChild.textContent = 'Select a hub to zoom in ';
    tabs.find(function (tab) { return tab.dataset.hub === selected; }).focus();
  });
  function selectHub(id, focus) {
    if (!hubs[id]) return;
    tabs.forEach(function (tab) {
      var active = tab.dataset.hub === id;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && focus) tab.focus();
    });
    pins.forEach(function (pin) {
      var active = pin.dataset.hub === id;
      pin.classList.toggle('is-active', active);
      pin.setAttribute('aria-pressed', String(active));
    });
    panels.forEach(function (panel) {
      var active = panel.id === 'panel-' + id;
      panel.hidden = !active;
      panel.classList.remove('is-entering');
      if (active && id !== selected && !motion.matches) {
        void panel.offsetWidth;
        panel.classList.add('is-entering');
      }
    });
    coordinates.textContent = hubs[id].coordinates;
    route.setAttribute('d', hubs[id].route);
    route.classList.remove('is-tracing');
    if (id !== selected && !motion.matches) {
      void route.getBoundingClientRect();
      route.classList.add('is-tracing');
    }
    zoomTo(id);
    mapInstruction.firstChild.textContent = 'Explore nearby places · Reset to see Texas ';
    selected = id;
  }
  tabs.forEach(function (tab, index) {
    tab.addEventListener('click', function () { selectHub(tab.dataset.hub, false); });
    tab.addEventListener('keydown', function (event) {
      var next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      selectHub(tabs[next].dataset.hub, true);
    });
  });
  pins.forEach(function (pin) {
    pin.addEventListener('click', function () { selectHub(pin.dataset.hub, false); });
    pin.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectHub(pin.dataset.hub, false);
      }
    });
  });
  motion.addEventListener('change', function () { zoomTo(zoomTarget); });

  var goalButtons = Array.from(document.querySelectorAll('[data-goal]'));
  var goalTitle = document.getElementById('loan-goal-title');
  var goalDescription = document.getElementById('loan-goal-description');
  var goals = {
    buy: { title: 'Start with a budget. Build a plan.', description: 'Compare conventional, FHA, and VA options, where eligible. We’ll talk through your down payment, monthly payment goals, and next steps toward preapproval.' },
    refinance: { title: 'Make your mortgage work for your next goal.', description: 'Review rate-and-term or cash-out refinancing, where available. Compare your current loan, closing costs, and break-even point before deciding whether a refinance makes sense.' },
    invest: { title: 'Build a financing plan for the property.', description: 'Explore conventional investment loans and DSCR options. We’ll discuss rental income, down payment, reserves, and how the property fits your plans. Program requirements vary.' }
  };
  goalButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      goalButtons.forEach(function (other) { if(other.tagName==='BUTTON')other.setAttribute('aria-pressed',String(other===button)); else other.toggleAttribute('data-selected',other===button); });
      var goal = goals[button.dataset.goal];
      goalTitle.textContent = goal.title;
      goalDescription.textContent = goal.description;
    });
  });

  var burger = document.getElementById('burger');
  var menu = document.getElementById('mmenu');
  var mobile = window.matchMedia('(max-width: 1100px)');
  function setMenu(open, restoreFocus) {
    burger.classList.toggle('open', open);
    menu.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
    menu.inert = !open;
    if (open) menu.querySelector('a').focus();
    else if (restoreFocus) burger.focus();
  }
  burger.addEventListener('click', function () { setMenu(burger.getAttribute('aria-expanded') !== 'true', false); });
  menu.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () { setMenu(false, true); });
  });
  document.addEventListener('keydown', function (event) {
    if (burger.getAttribute('aria-expanded') !== 'true') return;
    if (event.key === 'Escape') { setMenu(false, true); return; }
    if (event.key !== 'Tab') return;
    var links = Array.from(menu.querySelectorAll('a'));
    var first = links[0], last = links[links.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); burger.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); burger.focus(); }
    else if (document.activeElement === burger) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
  });
  mobile.addEventListener('change', function () { if (!mobile.matches) setMenu(false, false); });
})();
