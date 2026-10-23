// ============================================================================
// DANUBRA — ZIP bez knižnice
// ============================================================================
// Balík pre účtovníčku (tabuľky + PDF faktúr) ako jeden súbor. Súbory sa len
// ukladajú („store", bez kompresie) — PDF a fotky sú skomprimované už samy
// a vlastný kompresor by tu bol stovky riadkov kódu navyše.
//
// Testy: node app/lib/zip.test.js
// ============================================================================
(function () {
  let TABLE = null;
  function crcTable() {
    if (TABLE) return TABLE;
    TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      TABLE[n] = c >>> 0;
    }
    return TABLE;
  }
  function crc32(bytes) {
    const t = crcTable();
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  const enc = (s) => new TextEncoder().encode(s);

  function dosTime(d) {
    const x = d || new Date();
    return {
      time: ((x.getHours() << 11) | (x.getMinutes() << 5) | Math.floor(x.getSeconds() / 2)) & 0xFFFF,
      date: (((x.getFullYear() - 1980) << 9) | ((x.getMonth() + 1) << 5) | x.getDate()) & 0xFFFF,
    };
  }

  /**
   * @param {Array<{name:string, data:Uint8Array|string}>} files
   * @returns {Uint8Array} obsah .zip súboru
   */
  function zip(files, { date } = {}) {
    const parts = [], central = [];
    let offset = 0;
    const { time, date: dd } = dosTime(date);
    for (const f of files || []) {
      const name = enc(f.name);
      const data = typeof f.data === 'string' ? enc(f.data) : f.data;
      const crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true);                 // UTF-8 názvy
      local.setUint16(8, 0, true); local.setUint16(10, time, true); local.setUint16(12, dd, true);
      local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
      parts.push(new Uint8Array(local.buffer), name, data);

      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true);
      cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true); cen.setUint16(12, time, true); cen.setUint16(14, dd, true);
      cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true);
      cen.setUint16(28, name.length, true); cen.setUint16(30, 0, true); cen.setUint16(32, 0, true);
      cen.setUint16(34, 0, true); cen.setUint16(36, 0, true); cen.setUint32(38, 0, true); cen.setUint32(42, offset, true);
      central.push(new Uint8Array(cen.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cenSize = central.reduce((n, p) => n + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, (files || []).length, true); end.setUint16(10, (files || []).length, true);
    end.setUint32(12, cenSize, true); end.setUint32(16, offset, true);
    const all = [...parts, ...central, new Uint8Array(end.buffer)];
    const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
    let i = 0;
    for (const p of all) { out.set(p, i); i += p.length; }
    return out;
  }

  const API = { zip, crc32 };
  if (typeof window !== 'undefined') window.DanubraZip = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
