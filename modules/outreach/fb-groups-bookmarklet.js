/**
 * ADLIFY OUTREACH - FB Group Bookmarklet
 *
 * Čistý JS zdroj bookmarkletu. fb-groups.js ho fetchuje, vykoná
 * `replaceAll` substitúciu dvoch placeholderov v tele, encoduje
 * cez encodeURIComponent a vloží do href="javascript:...".
 *
 * Placeholders sa NESPOMÍNAJÚ v tomto headeri — inak by `replace`
 * mohol omylom trafiť komentár pred skutočný výskyt v kóde.
 *
 * Validácia: node --check modules/outreach/fb-groups-bookmarklet.js
 *
 * ŽIADNE // line-komentáre — len block. Po prípadnom whitespace
 * collapse hrozí "single-line zožerie zvyšok" problém.
 */
(function () {
  try {
    /* URL normalizácia: m.facebook.com -> www.facebook.com,
       odstrip /permalink/, /posts/, query params */
    var loc = location.href;
    var groupMatch = loc.match(/facebook\.com\/groups\/([^\/?#]+)/i);
    var url = groupMatch
      ? 'https://www.facebook.com/groups/' + groupMatch[1] + '/'
      : loc;

    /* Názov skupiny: og:title -> h1 -> document.title */
    var name = '';
    var ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle && ogTitle.content) name = ogTitle.content.trim();
    if (!name) {
      var h1 = document.querySelector('h1');
      if (h1) name = (h1.innerText || h1.textContent || '').trim();
    }
    if (!name) {
      name = (document.title || '')
        .replace(/\s*[\|\-]\s*Facebook\s*$/i, '')
        .trim();
    }

    /* Obrázok: og:image / twitter:image -> najväčší fbcdn img */
    var image = '';
    var ogImage =
      document.querySelector('meta[property="og:image"]') ||
      document.querySelector('meta[name="twitter:image"]');
    if (ogImage && ogImage.content) image = ogImage.content;
    if (!image) {
      var imgs = document.querySelectorAll('img');
      var bestSrc = '';
      var bestArea = 0;
      for (var i = 0; i < imgs.length; i++) {
        var img = imgs[i];
        var src = img.currentSrc || img.src || '';
        if (!/fbcdn\.net/i.test(src)) continue;
        var w = img.naturalWidth || img.width || 0;
        var h = img.naturalHeight || img.height || 0;
        if (w < 200 || h < 100) continue;
        var area = w * h;
        if (area > bestArea) {
          bestArea = area;
          bestSrc = src;
        }
      }
      image = bestSrc;
    }

    /* Member count — viacjazyčné */
    var memberWords =
      '(?:members?|člen(?:ov|ovia|ovi|ové|ový|y|u|a)?|členi|členu|mitglieder|miembros|tagok|membre|membres)';

    var sources = [];
    try {
      var anchors = document.querySelectorAll('a[href*="/members/"]');
      for (var a = 0; a < anchors.length; a++) {
        sources.push(
          (anchors[a].innerText || anchors[a].textContent || '').trim()
        );
      }
    } catch (e) {}
    try {
      sources.push(document.body.innerText || '');
    } catch (e) {}

    var combined = sources
      .join(' \n ')
      .replace(/[   ]/g, ' ');

    /* Patterny od najšpecifickejšieho po najobecnejší. */
    var patterns = [
      {
        re: new RegExp(
          '([0-9]+(?:[.,][0-9]+)?)\\s*(?:tis\\.?|tis(?:íc(?:e)?)?)\\s*' +
            memberWords,
          'i'
        ),
        mult: 1000
      },
      {
        re: new RegExp(
          '([0-9]+(?:[.,][0-9]+)?)\\s*([KkMm])\\s*' + memberWords
        ),
        mult: 'suffix'
      },
      {
        re: new RegExp('([0-9][0-9 .,]*[0-9]|[0-9])\\s*' + memberWords, 'i'),
        mult: 1
      },
      {
        re: new RegExp(
          memberWords + '\\s*[·:•|]\\s*([0-9][0-9 .,]*[0-9]|[0-9])',
          'i'
        ),
        mult: 1
      }
    ];

    var memberCount = null;
    for (var p = 0; p < patterns.length; p++) {
      var m = combined.match(patterns[p].re);
      if (!m) continue;
      var raw = m[1] || m[2];
      if (!raw) continue;
      var num = parseFloat(raw.replace(/\s/g, '').replace(',', '.'));
      if (isNaN(num)) continue;
      var mult = patterns[p].mult;
      if (mult === 'suffix') {
        var sfx = (m[2] || '').toLowerCase();
        if (sfx === 'k') num *= 1000;
        else if (sfx === 'm') num *= 1000000;
      } else if (typeof mult === 'number') {
        num *= mult;
      }
      memberCount = Math.round(num);
      break;
    }

    var DEBUG = __DEBUG__;
    if (DEBUG) {
      var preview = combined.substring(0, 300);
      var msg =
        '🔍 ADLIFY DEBUG\n\n' +
        'URL: ' + url + '\n' +
        'Názov: ' + (name || '(prázdne)') + '\n' +
        'Obrázok: ' + (image ? image.substring(0, 80) + '…' : '(žiadny)') + '\n' +
        'Členovia: ' + (memberCount === null ? '(neznáme)' : memberCount) + '\n\n' +
        'Text (300 znakov):\n' + preview;
      if (!confirm(msg + '\n\n→ Otvoriť Adlify import?')) return;
    }

    var qs =
      '&url=' + encodeURIComponent(url) +
      '&name=' + encodeURIComponent(name) +
      '&image=' + encodeURIComponent(image) +
      (memberCount === null ? '' : '&members=' + memberCount);

    /* window.open() namiesto fetch() — fetch by zlyhal na FB CSP connect-src */
    window.open('__IMPORT_BASE_URL__' + qs, '_blank');
  } catch (err) {
    alert(
      'Adlify bookmarklet error: ' +
        (err && err.message ? err.message : String(err))
    );
  }
})();
