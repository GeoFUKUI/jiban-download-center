import L from "https://code4sabae.github.io/leaflet-mjs/leaflet.mjs";
import { CSV } from "https://code4sabae.github.io/js/CSV.js";
import { Geo3x3 } from "https://taisukef.github.io/Geo3x3/Geo3x3.mjs";
import { EXIF } from "https://taisukef.github.io/exif-js/EXIF.js";
import { fetchImage } from "https://js.sabae.cc/fetchImage.js";
import { LeafletSprite } from "https://taisukef.github.io/leaflet.sprite-es/src/sprite.js";
LeafletSprite.init(L);

const getResized = (w, h, min) => {
  if (w > h) {
    return { width: min, height: min * h / w };
  } else {
    return { width: min * w / h, height: min };
  }
};
const omit = (s, len) => {
  if (s.length > len) {
    return s.substring(0, len) + "...";
  }
  return s;
};

class CSVMap extends HTMLElement {
  constructor() {
    super();
    this.init();
  }
  async init() {
    const getCSV = async () => {
      const fn = this.getAttribute("src");
      if (fn) {
        console.log(fn);
        const data = CSV.toJSON(await CSV.fetch(fn));
        return data;
      }
      const txt = this.textContent.trim();
      const data = CSV.toJSON(CSV.decode(txt));
      this.textContent = "";
      return data;
    };
    this.data = await getCSV();
    console.log(this.data);

    const grayscale = this.getAttribute("grayscale");
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://code4sabae.github.io/leaflet-mjs/" + (grayscale ? "leaflet-grayscale.css" : "leaflet.css");
    this.appendChild(link);
    const waitOnload = async (comp) => {
      return new Promise(resolve => {
        comp.onload = resolve;
      });
    };
    await waitOnload(link);

    const div = document.createElement("div");
    this.appendChild(div);
    div.style.width = this.getAttribute("width") || "100%";
    div.style.height = this.getAttribute("height") || "60vh";

    this.map = L.map(div);
    // set 国土地理院地図 https://maps.gsi.go.jp/development/ichiran.html
    const land = "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png";
    const sat = "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg";
    L.tileLayer(this.getAttribute("mode") == "satellite" ? sat : land, {
      attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>"',
      maxZoom: 18,
    }).addTo(this.map);

    await this.redraw();
  }
  set value(d) { // JSON or CSV string
    if (typeof d == "string") {
      d = CSV.toJSON(CSV.decode(d));
    }
    this.data = d;
    this.redraw();
  }
  async getLatLng(d) {
    const geo3x3 = d["sabaecc:geo3x3"] || d["geo3x3"] || d["Geo3x3"];
    if (geo3x3) {
      const pos = Geo3x3.decode(geo3x3);
      if (pos) {
        return [pos.lat, pos.lng];
      }
    }
    const lat = d["schema:latitude"] || d["latitude"] || d["lat"] || d["緯度"] || d["ic:緯度"];
    const lng = d["schema:longitude"] || d["longitude"] || d["lng"] || d["lon"] || d["long"] || d["経度"] || d["ic:経度"];
    if (lat && lng) {
      const strim = (s) => {
        if (typeof s == "string") {
          return s.trim();
        }
        return s;
      };
      return [strim(lat), strim(lng)];
    } else {
      const find = (prefix) => {
        for (const name in d) {
          if (name.toLowerCase().startsWith(prefix)) {
            return d[name];
          }
        }
        return null;
      };
      const lat = find("latitude_");
      const lng = find("longitude_");
      if (lat && lng) {
        return [lat, lng];
      }
    }
    if (this.getAttribute("useimage") == "false") {
      return null;
    }
    const img = d["photo"] || d["image"];
    if (!img) {
      return null;
    }
    const bin = new Uint8Array(await (await fetch(img)).arrayBuffer());
    const exif = EXIF.readFromBinaryFile(bin.buffer);
    if (exif) {
      const ll = EXIF.toLatLng(exif);
      if (ll) {
        return [ll.lat, ll.lng];
      }
    }
    return null;
  };
  makeTable(d) {
    const tbl = [];
    tbl.push("<table>");
    for (const name in d) {
      let val = d[name];
      if (val && (val.startsWith("http://") || val.startsWith("https://"))) {
        val = "<a href=" + val + ">" + omit(val, 30) + "</a>";
      }
      if (val) {
        if (name == "sabaecc:geo3x3") {
          tbl.push(`<tr><th>${name}</th><td><a href=https://code4sabae.github.io/geo3x3-map/#${val}>${val}</a></td></tr>`);
        } else {
          tbl.push(`<tr><th>${name}</th><td>${val}</td></tr>`);
        }
      }
    }
    tbl.push("</table>");
    return tbl.join("");
  }
  async getMarker(d, ll) {
    const allcolor = this.getAttribute("color") || "blue";
    if (this.getAttribute("lightmode") == "true") {
      return L.circle(ll, {
        radius: 10,
        color: d["color"] || allcolor,
      });
    }
    const icon = this.getAttribute("icon");
    const iconsize = this.getAttribute("iconsize") || 30;

    const title = d["schema:name"] || d["name"];
    const opt = { title };
    const icon2 = this.getAttribute("useimage") != "false" ? d["icon"] || d["photo"] || d["image"] || icon : icon;
    const iconsize2 = iconsize * 2;
    if (icon2) {
      const img = await fetchImage(icon2);
      const size = getResized(img.width, img.height, iconsize2);
      const iconw = size.width;
      const iconh = size.height;
      opt.icon = L.icon({
        iconUrl: icon2,
        iconRetilaUrl: icon2,
        iconSize: [iconw, iconh],
        iconAnchor: [iconw / 2, iconh / 2],
        popupAnchor: [0, -iconh / 2],
      });
    } else {
      const color = d["color"] || allcolor;
      if (LeafletSprite.colors.indexOf(color) >= 0) {
        opt.icon = L.spriteIcon(color);
      }
    }

    return L.marker(ll, opt);
  }
  async bindPopup(d, marker) {
    const title = d["schema:name"] || d["name"];
    const filter = this.getAttribute("filter")?.split(",");
    const url = d["schema:url"] || d["url"];

    const d2 = (() => {
      if (!filter) {
        return d;
      }
      const res = {};
      for (const n in d) {
        if (filter.indexOf(n) >= 0) {
          res[n] = d[n];
        }
      }
      return res;
    })();
    const tbl = this.makeTable(d2);

    const reg = /^https:\/\/geofukui.github.io\/jiban-opendata\/data\/(\d*)\/DATA\/(BED\d*)\.XML$/;
    const result = url.match(reg);
    const id1 = result[1];
    const id2 = result[2];
    const xml = `BOREHOLE_FUKUI,${id1}-${id2}`;

    const dlbutton = `<button onclick='add("${title}", "${url}")'>ダウンロードに追加</button>`;
    const chujouzu = `<a href='https://www.geo-stn.bosai.go.jp/api/boring_xml/index.php?xml=${xml}'><img style='width: 100%;' src='https://www.geo-stn.bosai.go.jp/api/boring_xml/img.php?xml=${xml}&top=0&bottom=38.65&color=1'></a>`;

    marker.bindPopup(
      (title ? (url ? `<a href=${url}>${title}</a>` : title) : "") + tbl
      + `${dlbutton}<br>`
      + `${chujouzu}`
    );
  }

  async redraw() {
    if (this.iconlayer) {
      this.map.removeLayer(this.iconlayer);
    }
    this.iconlayer = L.layerGroup();
    this.iconlayer.addTo(this.map);

    const lls = [];
    for (const d of this.data) {
      const ll = await this.getLatLng(d);
      if (!ll) {
        continue;
      }
      const marker = await this.getMarker(d, ll);
      await this.bindPopup(d, marker);
      lls.push(ll);

      this.iconlayer.addLayer(marker);
    }
    if (lls.length) {
      this.map.fitBounds(lls);
    }
  }
}

customElements.define("csv-map", CSVMap);


window.add = (title, url) => {
  dllist.innerHTML += `
    <li><a href="${url}">${title}</a></li>
  `;
}

export { CSVMap };
