/* Trackly — ícones de linha, minimalistas, desenhados à mão (sem lib externa). */
(function (global) {
  "use strict";
  function svg(inner, size) {
    size = size || 18;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  }
  global.ICONS = {
    grid: svg('<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>'),
    users: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3.2 19c.7-3 2.9-4.6 5.8-4.6s5.1 1.6 5.8 4.6"/><circle cx="17" cy="7.5" r="2.4"/><path d="M15.8 14.6c2.1.2 3.7 1.6 4.2 3.9"/>'),
    clipboard: svg('<rect x="5.5" y="4.5" width="13" height="16" rx="2"/><path d="M9 4.5V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v.5"/><path d="M8.5 11h7M8.5 15h5"/>'),
    target: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6" fill="currentColor"/>'),
    trend: svg('<path d="M3.5 16.5l5-6 4 3.2 7-9"/><circle cx="19.5" cy="4.7" r="1.6" fill="currentColor" stroke="none"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2M12 18.5v2M4.6 6.6l1.4 1.4M18 16l1.4 1.4M3.5 12h2M18.5 12h2M4.6 17.4L6 16M18 8l1.4-1.4"/>'),
    drop: svg('<path d="M12 3.5S6 10 6 14.5a6 6 0 0 0 12 0C18 10 12 3.5 12 3.5Z"/>'),
    moon: svg('<path d="M20 14.2A8.5 8.5 0 1 1 9.8 4a7 7 0 0 0 10.2 10.2Z"/>'),
    dumbbell: svg('<path d="M4 12h16M4 12a2 2 0 1 1 0-4M4 12a2 2 0 1 0 0 4M20 12a2 2 0 1 0 0-4M20 12a2 2 0 1 1 0 4M8 9v6M16 9v6"/>'),
    run: svg('<circle cx="15.2" cy="4.8" r="1.7"/><path d="M9 20l2.4-4.6-2-2 .7-4 3 2.3 3.3-1M6 14l3.3-1.3M12 20l3-3.6"/>'),
    plate: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/>'),
    check: svg('<path d="M4 12.5l5 5L20 6"/>'),
    dash: svg('<path d="M6 12h12"/>'),
    warn: svg('<path d="M12 4.5 21 19H3L12 4.5Z"/><path d="M12 10v4M12 16.5v.1"/>'),
    home: svg('<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9.5h12V10"/>'),
    photo: svg('<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><circle cx="8.5" cy="10.5" r="1.6"/><path d="M20.5 15.5 15 10l-9 8.5"/>'),
    clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    camera: svg('<path d="M4 8.5h3l1.5-2h7L17 8.5h3v10H4Z"/><circle cx="12" cy="13" r="3.2"/>'),
    menu: svg('<path d="M4 6.5h16M4 12h16M4 17.5h16"/>'),
    close: svg('<path d="M5 5l14 14M19 5 5 19"/>'),
    chevronR: svg('<path d="M9 5.5 15.5 12 9 18.5"/>'),
    arrowDown: svg('<path d="M12 4v14.5M6 13l6 6 6-6"/>'),
    bell: svg('<path d="M6 10a6 6 0 1 1 12 0c0 4 1.4 5.5 1.4 5.5H4.6S6 14 6 10Z"/><path d="M10 18.5a2 2 0 0 0 4 0"/>'),
    logout: svg('<path d="M9 4.5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h3M15 16l4-4-4-4M19 12H9"/>'),
    apple: svg('<path d="M12 8.5c-3-2.5-7-1-7 3.5 0 4 3 8 5.5 8 1 0 1.5-.5 2 -.5s1 .5 2 .5c2.2 0 5.5-3.6 5.5-7.5 0-3.5-3-5.3-5.5-3.5"/><path d="M12 8.5V5s.5-2 2.5-2.5"/>'),
    wallet: svg('<rect x="3.5" y="6.5" width="17" height="12" rx="2.2"/><path d="M3.5 10h17"/><circle cx="16.5" cy="14" r="1.1" fill="currentColor" stroke="none"/>'),
    coin: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M9.3 9.7c0-1.5 1.2-2.2 2.7-2.2s2.6.8 2.6 2c0 2.7-5.3 1.4-5.3 4 0 1.3 1.1 2.2 2.7 2.2s2.9-.8 2.9-2.3"/>')
  };
})(window);
