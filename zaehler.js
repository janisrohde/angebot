// Besucherzähler (GoatCounter): ohne Cookies, ohne Local Storage, speichert nichts im Browser.
// Zählt nur auf der echten Seite, nicht bei lokalen Tests.
// Link mit ?ref=liste6 zeigt im Dashboard, aus welcher Mail-Liste der Besuch kam.
(function () {
  if (!/^(www\.)?kontaktseite-qr\.de$|^janisrohde\.github\.io$/.test(location.hostname)) return;
  var u = "https://kontaktseite.goatcounter.com/count" +
    "?p=" + encodeURIComponent(location.pathname) +
    "&t=" + encodeURIComponent(document.title) +
    "&r=" + encodeURIComponent(document.referrer) +
    "&q=" + encodeURIComponent(location.search) +
    "&s=" + screen.width + "," + screen.height + "," + (window.devicePixelRatio || 1) +
    "&rnd=" + Math.random().toString(36).slice(2);
  new Image().src = u;
})();
