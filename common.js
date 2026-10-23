// Shared code for display.html and control.html
(function () {
  var SB = window.SB = {};

  SB.DEFAULTS = {
    homeName: 'IMPERIAL', awayName: 'UEA',
    homeColor: '#0b2a9e', awayColor: '#f5c400',
    homeLogo: 'logos/imperial.png', awayLogo: 'logos/uea.png',
    homeScore: 0, awayScore: 0, homeShots: 0, awayShots: 0,
    period: '1', periodLen: 20, otLen: 5,
    showShots: true, showLeague: true, autoPP: true, goalShot: true
  };

  SB.PERIOD_LABELS = { '1': '1ST', '2': '2ND', '3': '3RD', 'OT': 'OT', 'SO': 'SO', 'INT': 'INT', 'FINAL': 'FINAL' };

  // ---------- time ----------
  SB.offset = 0; // difference between this device's clock and Firebase's clock
  SB.serverNow = function () { return Date.now() + SB.offset; };

  SB.fmtClock = function (ms) {
    ms = Math.max(0, ms);
    if (ms >= 60000) {
      var t = Math.floor(ms / 1000);
      return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
    }
    var d = Math.floor(ms / 100);
    return Math.floor(d / 10) + '.' + (d % 10);
  };
  SB.fmtPen = function (ms) {
    var t = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  };

  // Works out the clock and penalty times right now from the stored state.
  // Stored: clock {running, baseMs, startedAt}; pens {id: {team, type, added, baseMs}}.
  // While running, everything counts down from startedAt. Penalties stop when the clock hits 0.
  SB.live = function (S, now) {
    var c = S.clock || { running: false, baseMs: 0, startedAt: 0 };
    var el = c.running ? Math.max(0, Math.min(now - c.startedAt, c.baseMs)) : 0;
    var pens = [];
    var p = S.pens || {};
    Object.keys(p).forEach(function (id) {
      var x = p[id];
      pens.push({ id: id, team: x.team, type: x.type, added: x.added || 0, ms: x.baseMs - el });
    });
    pens.sort(function (a, b) { return a.added - b.added; });
    return { clockMs: Math.max(0, c.baseMs - el), running: !!c.running, pens: pens };
  };

  SB.textOn = function (hex) {
    var h = String(hex || '#000000').replace('#', '');
    var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#111' : '#fff';
  };

  // ---------- board ----------
  SB.boardHTML =
    '<div class="sb-board">' +
      '<div class="team home"><div class="logo"><img alt=""></div><div class="name"></div><div class="score">0</div><div class="tab"></div></div>' +
      '<div class="team away"><div class="logo"><img alt=""></div><div class="name"></div><div class="score">0</div><div class="tab"></div></div>' +
      '<div class="info"><div class="period"></div><div class="clock"></div>' +
        '<div class="league"><img src="logos/buiha.png" alt="BUIHA"></div><div class="tab"></div></div>' +
    '</div>';

  function minRem(arr) { return Math.min.apply(null, arr.map(function (p) { return p.ms; })); }

  SB.renderBoard = function (root, S, L) {
    ['home', 'away'].forEach(function (t) {
      var team = root.querySelector('.team.' + t);
      team.style.setProperty('--c', S[t + 'Color']);
      team.style.setProperty('--t', SB.textOn(S[t + 'Color']));
      var name = team.querySelector('.name');
      var txt = S[t + 'Name'] || (t === 'home' ? 'HOME' : 'AWAY');
      if (name.textContent !== txt) name.textContent = txt;
      name.style.fontSize = txt.length > 11 ? '19px' : (txt.length > 8 ? '22px' : '26px');
      team.querySelector('.score').textContent = S[t + 'Score'] || 0;
      var logo = S[t + 'Logo'] || '';
      var img = team.querySelector('.logo img');
      if (img.getAttribute('src') !== logo) img.setAttribute('src', logo);
      team.querySelector('.logo').classList.toggle('show', !!logo);
    });

    root.querySelector('.period').textContent = SB.PERIOD_LABELS[S.period] || S.period || '';
    var clock = root.querySelector('.clock');
    clock.textContent = SB.fmtClock(L.clockMs);
    clock.classList.toggle('stopped', !L.running && S.period !== 'FINAL');
    root.querySelector('.league').classList.toggle('hide', S.showLeague === false);

    var active = L.pens.filter(function (p) { return p.ms > 0; });
    var hp = active.filter(function (p) { return p.team === 'home'; });
    var ap = active.filter(function (p) { return p.team === 'away'; });
    var tabs = { home: '', away: '', info: '' }, pp = { home: false, away: false };
    if (ap.length > hp.length) { tabs.home = 'POWER PLAY ' + SB.fmtPen(minRem(ap)); pp.home = true; }
    if (hp.length > ap.length) { tabs.away = 'POWER PLAY ' + SB.fmtPen(minRem(hp)); pp.away = true; }
    if (hp.length === ap.length && hp.length > 0) {
      var n = Math.max(3, 5 - hp.length);
      tabs.info = n + ' ON ' + n + ' ' + SB.fmtPen(Math.min(minRem(hp), minRem(ap)));
    }
    if (S.showShots) {
      if (!tabs.home) tabs.home = 'SHOTS ' + (S.homeShots || 0);
      if (!tabs.away) tabs.away = 'SHOTS ' + (S.awayShots || 0);
    }
    var tabEls = { home: root.querySelector('.team.home .tab'), away: root.querySelector('.team.away .tab'), info: root.querySelector('.info .tab') };
    Object.keys(tabEls).forEach(function (k) {
      var el = tabEls[k];
      el.textContent = tabs[k];
      el.classList.toggle('show', !!tabs[k]);
      el.classList.toggle('pp', !!pp[k]);
    });
  };

  // ---------- Firebase ----------
  SB.initFirebase = function (onError) {
    var c = window.FIREBASE_CONFIG;
    if (!window.firebase) { onError('Could not load Firebase. Check the internet connection.'); return null; }
    if (!c || !c.databaseURL || /PASTE_HERE/.test(String(c.apiKey) + String(c.databaseURL))) {
      onError('Firebase is not set up yet. Paste your Firebase config into config.js.');
      return null;
    }
    try {
      firebase.initializeApp(c);
      var db = firebase.database();
      db.ref('.info/serverTimeOffset').on('value', function (s) { SB.offset = s.val() || 0; });
      return db;
    } catch (e) {
      onError('Firebase error: ' + e.message);
      return null;
    }
  };

  SB.boardKey = function () {
    var k = new URLSearchParams(location.search).get('board') || '';
    return /^[A-Za-z0-9]{16,}$/.test(k) ? k : '';
  };
})();
