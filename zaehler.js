// Besucherzähler (GoatCounter): ohne Cookies, ohne Local Storage, speichert nichts im Browser.
// Zählt nur auf der echten Seite, nicht bei lokalen Tests.
(function () {
  if (location.hostname !== "janisrohde.github.io") return;
  var u = "https://kontaktseite.goatcounter.com/count" +
    "?p=" + encodeURIComponent(location.pathname) +
    "&t=" + encodeURIComponent(document.title) +
    "&r=" + encodeURIComponent(document.referrer) +
    "&s=" + screen.width + "," + screen.height + "," + (window.devicePixelRatio || 1) +
    "&rnd=" + Math.random().toString(36).slice(2);
  new Image().src = u;
})();
