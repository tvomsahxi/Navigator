/* Navigator — portal application logic (no build step, no dependencies) */
(function () {
  "use strict";

  var NAV = window.NAV;
  var DOCS = NAV.documents;

  /* ---- lookups --------------------------------------------------------- */
  var byId = {};
  var regionOf = {}, typeOf = {}, catOf = {}, domainOf = {}, clusterOf = {};
  NAV.regions.forEach(function (r) { regionOf[r.code] = r; });
  NAV.types.forEach(function (t) { typeOf[t.code] = t; });
  NAV.categories.forEach(function (c) { catOf[c.code] = c; });
  NAV.domains.forEach(function (d) { domainOf[d.code] = d; });
  NAV.clusters.forEach(function (c) { clusterOf[c.code] = c; });

  var CAT_ORDER = NAV.categories.map(function (c) { return c.code; });

  /* Normalise: catsAll = 文書として宣言したカテゴリ ∪ 章に付いたカテゴリ。
     一覧の表示は宣言済み（主用途）を優先し、章由来のみのものは副次として薄く出す。 */
  DOCS.forEach(function (d) {
    d.cats = d.cats || [];
    d.domains = d.domains || [];
    d.chapters = d.chapters || [];
    d.rel = d.rel || [];
    var set = {};
    d.cats.forEach(function (c) { set[c] = 1; });
    d.chapters.forEach(function (ch) { (ch.cat || []).forEach(function (c) { set[c] = 1; }); });
    d.catsAll = CAT_ORDER.filter(function (c) { return set[c]; });
    d.catsSecondary = d.catsAll.filter(function (c) { return d.cats.indexOf(c) === -1; });
    d.searchBlob = [
      d.short, d.title, d.orig, d.issuer, d.summary, d.scope, d.version, d.binding,
      d.chapters.map(function (ch) { return ch.no + " " + ch.title + " " + (ch.note || ""); }).join(" "),
      d.domains.map(function (x) { return domainOf[x] ? domainOf[x].name : x; }).join(" "),
      d.catsAll.map(function (x) { return catOf[x] ? catOf[x].name : x; }).join(" ")
    ].join(" ").toLowerCase();
    byId[d.id] = d;
  });

  /* 逆方向の関係も参照できるようにする（A→B を B 側からも見せる） */
  DOCS.forEach(function (d) { d.relIn = []; });
  DOCS.forEach(function (d) {
    d.rel.forEach(function (r) {
      var t = byId[r.to];
      if (t) t.relIn.push({ from: d.id, kind: r.kind, note: r.note });
    });
  });

  /* ---- state ----------------------------------------------------------- */
  var state = {
    view: "docs",
    q: "",
    region: [], type: [], domain: [], cat: [],
    sort: "region", dir: 1,
    selected: null
  };

  var FACETS = ["region", "type", "domain", "cat"];

  /* ---- helpers --------------------------------------------------------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function el(sel) { return document.querySelector(sel); }
  function has(arr, v) { return arr.indexOf(v) !== -1; }

  function matchesExcept(d, skipFacet) {
    if (state.q) {
      var terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      for (var i = 0; i < terms.length; i++) {
        if (d.searchBlob.indexOf(terms[i]) === -1) return false;
      }
    }
    if (skipFacet !== "region" && state.region.length && !has(state.region, d.region)) return false;
    if (skipFacet !== "type" && state.type.length && !has(state.type, d.type)) return false;
    if (skipFacet !== "domain" && state.domain.length &&
        !state.domain.some(function (x) { return has(d.domains, x); })) return false;
    if (skipFacet !== "cat" && state.cat.length &&
        !state.cat.some(function (x) { return has(d.catsAll, x); })) return false;
    return true;
  }
  function matches(d) { return matchesExcept(d, null); }

  function filtered() { return DOCS.filter(matches); }

  var REGION_RANK = { JP: 0, US: 1, EU: 2, INT: 3 };
  var TYPE_RANK = {};
  NAV.types.forEach(function (t, i) { TYPE_RANK[t.code] = i; });

  function sorted(list) {
    var k = state.sort, dir = state.dir;
    var copy = list.slice();
    copy.sort(function (a, b) {
      var v = 0;
      if (k === "region") v = (REGION_RANK[a.region] - REGION_RANK[b.region]) ||
                              (TYPE_RANK[a.type] - TYPE_RANK[b.type]) ||
                              a.short.localeCompare(b.short, "ja");
      else if (k === "name") v = a.short.localeCompare(b.short, "ja");
      else if (k === "issuer") v = a.issuer.localeCompare(b.issuer, "ja");
      else if (k === "type") v = (TYPE_RANK[a.type] - TYPE_RANK[b.type]) || a.short.localeCompare(b.short, "ja");
      else if (k === "year") v = (a.year - b.year) || a.short.localeCompare(b.short, "ja");
      else if (k === "chapters") v = (a.chapters.length - b.chapters.length) || a.short.localeCompare(b.short, "ja");
      return v * dir;
    });
    return copy;
  }

  /* ---- chip renderers -------------------------------------------------- */
  function regionChip(code) {
    var r = regionOf[code];
    return '<span class="chip chip--region rg-' + code + '">' + esc(r ? r.name : code) + "</span>";
  }
  function typeChip(code) {
    var t = typeOf[code];
    return '<span class="chip chip--type" data-t="' + code + '">' + esc(t ? t.name : code) + "</span>";
  }
  function catChips(d, limit) {
    var primary = d.cats.slice();
    var sec = d.catsSecondary.slice();
    var out = [];
    primary.forEach(function (c) {
      out.push('<span class="chip chip--code chip--cat" title="' + esc(catOf[c] ? catOf[c].name : c) + '">' + c + "</span>");
    });
    if (limit && sec.length) {
      sec.forEach(function (c) {
        out.push('<span class="chip chip--code chip--cat chip--sec" title="' +
          esc((catOf[c] ? catOf[c].name : c) + "（章単位で該当）") + '">' + c + "</span>");
      });
    }
    return out.join("");
  }
  function domChips(d) {
    if (d.domains.length === NAV.domains.length) {
      return '<span class="chip" title="' + esc(NAV.domains.map(function (x) { return x.name; }).join("、")) +
        '">全ドメイン</span>';
    }
    var show = d.domains.slice(0, 6), rest = d.domains.slice(6);
    var out = show.map(function (x) {
      var dm = domainOf[x];
      return '<span class="chip chip--code" title="' + esc(dm ? dm.name : x) + '">' + x + "</span>";
    });
    if (rest.length) {
      out.push('<span class="chip chip--code chip--sec" title="' +
        esc(rest.map(function (x) { return domainOf[x] ? domainOf[x].name : x; }).join("、")) +
        '">+' + rest.length + "</span>");
    }
    return out.join("");
  }

  /* ---- filter rail ----------------------------------------------------- */
  function facetCounts(facet, codes, accessor) {
    var pool = DOCS.filter(function (d) { return matchesExcept(d, facet); });
    var counts = {};
    codes.forEach(function (c) { counts[c] = 0; });
    pool.forEach(function (d) {
      var v = accessor(d);
      (Array.isArray(v) ? v : [v]).forEach(function (c) {
        if (counts[c] !== undefined) counts[c]++;
      });
    });
    return counts;
  }

  function renderGroup(title, facet, items, counts) {
    var sel = state[facet];
    var rows = items.map(function (it) {
      var n = counts[it.code] || 0;
      var on = has(sel, it.code);
      return '<button class="fopt' + (n === 0 && !on ? " fopt--dim" : "") + '" role="checkbox"' +
        ' aria-pressed="' + on + '" aria-checked="' + on + '"' +
        ' data-facet="' + facet + '" data-code="' + it.code + '"' +
        (it.tip ? ' title="' + esc(it.tip) + '"' : "") + ">" +
        '<span class="fopt__box" aria-hidden="true"></span>' +
        (it.code2 ? '<span class="fcode">' + esc(it.code2) + "</span>" : "") +
        '<span class="fopt__label">' + esc(it.label) + "</span>" +
        '<span class="fopt__n">' + n + "</span></button>";
    }).join("");
    return '<section class="fgroup"><h2 class="fgroup__title">' + esc(title) + "</h2>" +
      '<div class="fgroup__list">' + rows + "</div></section>";
  }

  function renderRail() {
    var rc = facetCounts("region", NAV.regions.map(function (r) { return r.code; }), function (d) { return d.region; });
    var tc = facetCounts("type", NAV.types.map(function (t) { return t.code; }), function (d) { return d.type; });
    var dc = facetCounts("domain", NAV.domains.map(function (x) { return x.code; }), function (d) { return d.domains; });
    var cc = facetCounts("cat", CAT_ORDER, function (d) { return d.catsAll; });

    var n = filtered().length;
    var any = state.q || FACETS.some(function (f) { return state[f].length; });

    var html =
      '<div class="rail__head">' +
        '<span class="rail__count"><b>' + n + "</b> / " + DOCS.length + " 件</span>" +
        (any ? '<button class="rail__reset" id="resetAll">条件をクリア</button>' : "") +
      "</div>" +
      renderGroup("地域", "region", NAV.regions.map(function (r) {
        return { code: r.code, label: r.name, code2: r.code, tip: r.full };
      }), rc) +
      renderGroup("文書種別", "type", NAV.types.map(function (t) {
        return { code: t.code, label: t.name, tip: t.desc };
      }), tc) +
      renderGroup("事業ドメイン", "domain", NAV.domains.map(function (x) {
        return { code: x.code, label: x.name, code2: x.code, tip: x.segment + " — " + x.desc };
      }), dc) +
      renderGroup("業務カテゴリ", "cat", NAV.categories.map(function (c) {
        return { code: c.code, label: c.name, code2: c.code, tip: c.def };
      }), cc);

    el("#rail").innerHTML = html;
  }

  /* ---- documents view -------------------------------------------------- */
  function sortBtn(key, label) {
    var on = state.sort === key;
    return '<button data-sort="' + key + '">' + esc(label) +
      (on ? '<span class="arrow">' + (state.dir === 1 ? "▲" : "▼") + "</span>" : "") + "</button>";
  }

  function activeFilterChips() {
    var out = [];
    if (state.q) out.push('<button class="afchip" data-clear="q"><b>検索</b> ' + esc(state.q) + "</button>");
    FACETS.forEach(function (f) {
      var label = { region: "地域", type: "種別", domain: "ドメイン", cat: "カテゴリ" }[f];
      state[f].forEach(function (code) {
        var name = f === "region" ? regionOf[code].name
                 : f === "type" ? typeOf[code].name
                 : f === "domain" ? domainOf[code].name
                 : catOf[code].name;
        out.push('<button class="afchip" data-facet="' + f + '" data-code="' + code + '"><b>' +
          label + "</b> " + esc(name) + "</button>");
      });
    });
    return out.length ? '<div class="activefilters">' + out.join("") + "</div>" : "";
  }

  function renderDocs() {
    var list = sorted(filtered());
    var rows = list.map(function (d) {
      return '<tr data-id="' + d.id + '" aria-selected="' + (state.selected === d.id) + '">' +
        '<td class="c-doc"><div class="c-doc__short">' + esc(d.short) +
          (d.verify ? '<span class="flag-verify" title="' + esc(d.verify) + '">!</span>' : "") +
        "</div>" +
        '<div class="c-doc__title">' + esc(d.title) + "</div></td>" +
        "<td>" + regionChip(d.region) + "</td>" +
        "<td>" + typeChip(d.type) + "</td>" +
        '<td class="c-issuer">' + esc(d.issuer) + "</td>" +
        '<td class="c-year">' + esc(d.year) + "</td>" +
        '<td class="c-chapn">' + d.chapters.length + "</td>" +
        '<td><div class="chips">' + domChips(d) + "</div></td>" +
        '<td><div class="chips">' + catChips(d, true) + "</div></td>" +
      "</tr>";
    }).join("");

    return '<div class="viewhead">' +
        "<h1>文書一覧</h1>" +
        "<p>行を選ぶと、その文書の章立てと関連文書が右側に開く。" +
        "業務カテゴリの濃い印は文書全体の主用途、薄い印は特定の章だけが該当するもの。" +
        '<span class="flag-verify" style="vertical-align:1px">!</span> は原典で確認すべき記載があることを示す。</p>' +
      "</div>" +
      activeFilterChips() +
      (list.length === 0
        ? '<div class="tablewrap"><div class="empty">条件に一致する文書がありません。</div></div>'
        : '<div class="tablewrap tablewrap--pane"><table class="docs"><thead><tr>' +
            "<th>" + sortBtn("name", "文書") + "</th>" +
            "<th>" + sortBtn("region", "地域") + "</th>" +
            "<th>" + sortBtn("type", "種別") + "</th>" +
            "<th>" + sortBtn("issuer", "発行主体") + "</th>" +
            "<th>" + sortBtn("year", "年") + "</th>" +
            '<th style="text-align:right">' + sortBtn("chapters", "章") + "</th>" +
            "<th>ドメイン</th><th>業務カテゴリ</th>" +
          "</tr></thead><tbody>" + rows + "</tbody></table></div>");
  }

  /* ---- categories view ------------------------------------------------- */
  function renderCats() {
    var counts = {};
    CAT_ORDER.forEach(function (c) {
      counts[c] = DOCS.filter(function (d) { return has(d.catsAll, c); }).length;
    });

    var m = NAV.meceNote;
    var clusters = NAV.clusters.map(function (cl) {
      var cards = NAV.categories.filter(function (c) { return c.cluster === cl.code; }).map(function (c) {
        return '<button class="catcard" data-gocat="' + c.code + '">' +
          '<div class="catcard__head">' +
            '<span class="catcard__code">' + c.code + "</span>" +
            '<span class="catcard__name">' + esc(c.name) + "</span>" +
            '<span class="catcard__n">' + counts[c.code] + " 文書</span>" +
          "</div>" +
          '<p class="catcard__def">' + esc(c.def) + "</p>" +
          '<div class="catcard__sub">主な成果物</div>' +
          '<ul class="catcard__list">' + c.outputs.map(function (o) {
            return "<li>" + esc(o) + "</li>";
          }).join("") + "</ul>" +
          '<div class="catcard__roles">担当: ' + esc(c.roles.join("、")) + "</div>" +
          '<div class="catcard__tb"><b>境界の判定ルール</b>' + esc(c.tiebreak) + "</div>" +
        "</button>";
      }).join("");

      return '<section class="cluster">' +
        '<div class="cluster__head">' +
          '<span class="cluster__code">' + cl.code + "</span>" +
          '<span class="cluster__name">' + esc(cl.name) + "</span>" +
          '<span class="cluster__desc">' + esc(cl.desc) + "</span>" +
        "</div>" +
        '<div class="catgrid">' + cards + "</div>" +
      "</section>";
    }).join("");

    return '<div class="viewhead">' +
        "<h1>業務カテゴリ体系</h1>" +
        "<p>サイバーセキュリティ業務を11に分割した MECE な分類。カードを選ぶと、そのカテゴリに該当する文書の一覧に移動する。</p>" +
      "</div>" +
      '<div class="mecebox">' +
        '<div class="mecebox__row"><div class="mecebox__k">分割軸</div><div class="mecebox__v">' + esc(m.axis) + "</div></div>" +
        '<div class="mecebox__row"><div class="mecebox__k">漏れがない</div><div class="mecebox__v">' + esc(m.exhaustive) + "</div></div>" +
        '<div class="mecebox__row"><div class="mecebox__k">重なりがない</div><div class="mecebox__v">' + esc(m.exclusive) + "</div></div>" +
        '<div class="mecebox__row"><div class="mecebox__k">注意</div><div class="mecebox__v"><b>' + esc(m.caveat) + "</b></div></div>" +
      "</div>" +
      clusters;
  }

  /* ---- matrix view ----------------------------------------------------- */
  function renderMatrix() {
    var grid = {}, max = 0, min = Infinity;
    NAV.domains.forEach(function (dm) {
      grid[dm.code] = {};
      CAT_ORDER.forEach(function (c) {
        var n = DOCS.filter(function (d) {
          return has(d.domains, dm.code) && has(d.catsAll, c);
        }).length;
        grid[dm.code][c] = n;
        if (n > max) max = n;
        if (n < min) min = n;
      });
    });
    /* 実データの下限が 0 から離れているため、[min, max] に正規化しないと
       濃淡がほとんど付かない。0 だけは無色にして「該当なし」を区別する。 */
    var span = Math.max(1, max - min);
    function tint(n) {
      if (n === 0) return "transparent";
      var a = (n - min) / span;
      return "color-mix(in srgb, var(--accent) " + Math.round(8 + a * 46) + "%, transparent)";
    }

    var head = '<tr><th style="text-align:left">事業ドメイン</th>' +
      CAT_ORDER.map(function (c) {
        return '<th class="mx-cat" title="' + esc(catOf[c].name) + '">' + c + "</th>";
      }).join("") + '<th class="mx-cat">計</th></tr>';

    var body = NAV.domains.map(function (dm) {
      var tot = DOCS.filter(function (d) { return has(d.domains, dm.code); }).length;
      return "<tr><th>" + esc(dm.name) + '<span class="seg">' + esc(dm.segment) + "</span></th>" +
        CAT_ORDER.map(function (c) {
          var n = grid[dm.code][c];
          return '<td style="background:' + tint(n) + '"><button class="mxcell" data-zero="' + (n === 0) +
            '" data-dm="' + dm.code + '" data-cat="' + c + '" title="' +
            esc(dm.name + " × " + catOf[c].name + " — " + n + " 文書") +
            '">' + n + "</button></td>";
        }).join("") +
        '<td class="mxtot"><span class="mxcell">' + tot + "</span></td></tr>";
    }).join("");

    return '<div class="viewhead">' +
        "<h1>ドメイン × 業務カテゴリ</h1>" +
        "<p>三菱電機の事業ドメインごとに、どの業務カテゴリに文書が集まっているかを示す。" +
        "数値はその組み合わせに該当する文書数。セルを選ぶとその条件で一覧を絞り込む。" +
        "薄いセルは対象文書が少ない領域で、参照すべき文書が本当に無いのか、収録が足りていないのかを点検する手掛かりになる。</p>" +
      "</div>" +
      '<div class="tablewrap" style="padding:2px"><table class="matrix">' +
        "<thead>" + head + "</thead><tbody>" + body + "</tbody></table></div>" +
      '<div class="legend"><span>' + min + " 文書</span>" +
        '<span class="legend__scale">' +
        [0, .25, .5, .75, 1].map(function (a) {
          return '<span class="legend__sw" style="background:color-mix(in srgb, var(--accent) ' +
            Math.round(8 + a * 46) + '%, transparent)"></span>';
        }).join("") +
      "</span><span>" + max + " 文書</span></div>";
  }

  /* ---- relations view -------------------------------------------------- */
  function renderRels() {
    var pool = filtered();
    var inPool = {};
    pool.forEach(function (d) { inPool[d.id] = 1; });

    var groups = {};
    Object.keys(NAV.relKinds).forEach(function (k) { groups[k] = []; });
    pool.forEach(function (d) {
      d.rel.forEach(function (r) {
        if (!byId[r.to]) return;
        groups[r.kind].push({ from: d, to: byId[r.to], note: r.note, both: !!inPool[r.to] });
      });
    });

    var total = Object.keys(groups).reduce(function (a, k) { return a + groups[k].length; }, 0);

    var sections = Object.keys(NAV.relKinds).map(function (k) {
      var list = groups[k];
      if (!list.length) return "";
      var kind = NAV.relKinds[k];
      var edges = list.map(function (e) {
        return '<div class="reledge">' +
          '<div class="reledge__side">' + regionChip(e.from.region) +
            '<button class="reledge__name" data-id="' + e.from.id + '">' + esc(e.from.short) + "</button></div>" +
          '<div class="reledge__mid"><span class="reledge__arrow">──▶ ' + esc(kind.label) + "</span></div>" +
          '<div class="reledge__side">' + regionChip(e.to.region) +
            '<button class="reledge__name" data-id="' + e.to.id + '">' + esc(e.to.short) + "</button></div>" +
          (e.note ? '<div class="reledge__note">' + esc(e.note) + "</div>" : "") +
        "</div>";
      }).join("");
      return '<section class="d-sec"><h2 class="d-sec__h">' + esc(kind.label) +
        '<span class="n">' + list.length + "</span> — " + esc(kind.desc) + "</h2>" +
        '<div class="reledges">' + edges + "</div></section>";
    }).join("");

    return '<div class="viewhead">' +
        "<h1>文書間の関係</h1>" +
        "<p>左の文書から見た関係を、関係の種類ごとに並べる。左側の絞り込み条件は関係の起点となる文書に適用される。" +
        "国際規格が各法域でどう受け入れられ、法令が何を実装手段として想定しているかは、" +
        "「実装手段」と「国内適用」の2つの群を見るのが早い。</p>" +
      "</div>" +
      activeFilterChips() +
      (total === 0 ? '<div class="empty">条件に一致する関係がありません。</div>' : sections);
  }

  /* ---- drawer ---------------------------------------------------------- */
  function relBlock(d) {
    var out = [];
    var groups = {};
    d.rel.forEach(function (r) {
      if (!byId[r.to]) return;
      (groups[r.kind] = groups[r.kind] || []).push({ doc: byId[r.to], note: r.note, dir: "out" });
    });
    d.relIn.forEach(function (r) {
      if (!byId[r.from]) return;
      var k = "in:" + r.kind;
      (groups[k] = groups[k] || []).push({ doc: byId[r.from], note: r.note, dir: "in" });
    });

    var order = Object.keys(NAV.relKinds).concat(Object.keys(NAV.relKinds).map(function (k) { return "in:" + k; }));
    order.forEach(function (k) {
      var list = groups[k];
      if (!list || !list.length) return;
      var incoming = k.indexOf("in:") === 0;
      var kind = NAV.relKinds[incoming ? k.slice(3) : k];
      out.push('<div class="relgroup"><div class="relgroup__h">' +
        '<span class="kindbadge">' + (incoming ? "◀ 被参照" : "▶ 参照") + "</span>" +
        esc(incoming ? "この文書を「" + kind.label + "」として挙げている文書" : kind.label) +
        "</div>" +
        list.map(function (e) {
          return '<button class="rellink" data-id="' + e.doc.id + '">' +
            '<div class="rellink__top">' + regionChip(e.doc.region) + typeChip(e.doc.type) +
              '<span class="rellink__name">' + esc(e.doc.short) + "</span></div>" +
            (e.note ? '<div class="rellink__note">' + esc(e.note) + "</div>" : "") +
          "</button>";
        }).join("") + "</div>");
    });
    return out.length ? out.join("") : '<p style="color:var(--ink-3);font-size:12.5px">登録された関係はありません。</p>';
  }

  function renderDrawer(d) {
    var bar = el("#drawerBar"), body = el("#drawerBody");
    if (!d) { el("#drawer").setAttribute("data-open", "false"); el("#scrim").setAttribute("data-open", "false"); return; }

    bar.innerHTML = '<div class="chips">' + regionChip(d.region) + typeChip(d.type) +
      '<span class="chip chip--code">' + esc(d.year) + "</span></div>" +
      '<button class="iconbtn" id="drawerClose" aria-label="閉じる">✕</button>';

    var chapters = d.chapters.map(function (ch) {
      return '<div class="chap"><div class="chap__head">' +
        '<span class="chap__no">' + esc(ch.no) + "</span>" +
        '<span class="chap__title">' + esc(ch.title) + "</span></div>" +
        (ch.note ? '<div class="chap__note">' + esc(ch.note) + "</div>" : "") +
        ((ch.cat && ch.cat.length)
          ? '<div class="chap__cats">' + ch.cat.map(function (c) {
              return '<span class="chip chip--code chip--cat" title="' + esc(catOf[c] ? catOf[c].name : c) + '">' + c + "</span>";
            }).join("") + "</div>"
          : "") +
      "</div>";
    }).join("");

    body.innerHTML =
      '<h2 class="d-title">' + esc(d.short) + "</h2>" +
      '<p class="d-fulltitle">' + esc(d.title) + "</p>" +
      (d.orig ? '<p class="d-orig">' + esc(d.orig) + "</p>" : "") +
      (d.verify ? '<div class="d-note"><b>要確認 </b>' + esc(d.verify) + "</div>" : "") +
      '<dl class="d-meta">' +
        "<dt>発行主体</dt><dd>" + esc(d.issuer) + "</dd>" +
        "<dt>版・年</dt><dd>" + esc(d.version || "—") + "（" + esc(d.year) + "）</dd>" +
        "<dt>拘束力</dt><dd>" + esc(d.binding || "—") + "</dd>" +
        "<dt>事業ドメイン</dt><dd>" + d.domains.map(function (x) {
          return esc(domainOf[x] ? domainOf[x].name : x);
        }).join("、") + "</dd>" +
        "<dt>原典</dt><dd><a href=\"" + esc(d.url) + "\" target=\"_blank\" rel=\"noopener noreferrer\">" +
          esc(d.url) + "</a></dd>" +
      "</dl>" +
      '<section class="d-sec"><h2 class="d-sec__h">概要</h2><p>' + esc(d.summary) + "</p></section>" +
      '<section class="d-sec"><h2 class="d-sec__h">適用対象</h2><p>' + esc(d.scope) + "</p></section>" +
      '<section class="d-sec"><h2 class="d-sec__h">主な業務カテゴリ</h2>' +
        '<div class="chips" style="max-width:none">' + catChips(d, true) + "</div>" +
        '<p style="font-size:11.5px;color:var(--ink-3);margin-top:6px">' +
        "濃い印は文書全体としての主用途、薄い印は特定の章だけが該当するもの。</p></section>" +
      '<section class="d-sec"><h2 class="d-sec__h">章立て<span class="n">' + d.chapters.length + "</span></h2>" +
        chapters + "</section>" +
      '<section class="d-sec"><h2 class="d-sec__h">関連文書</h2>' + relBlock(d) + "</section>";

    el("#drawer").setAttribute("data-open", "true");
    el("#scrim").setAttribute("data-open", "true");
    body.scrollTop = 0;
  }

  function select(id) {
    state.selected = id;
    renderDrawer(byId[id]);
    var rows = document.querySelectorAll("table.docs tbody tr");
    for (var i = 0; i < rows.length; i++) {
      rows[i].setAttribute("aria-selected", rows[i].getAttribute("data-id") === id);
    }
  }
  function closeDrawer() {
    state.selected = null;
    renderDrawer(null);
    var rows = document.querySelectorAll("table.docs tbody tr");
    for (var i = 0; i < rows.length; i++) rows[i].setAttribute("aria-selected", "false");
  }

  /* ---- render root ----------------------------------------------------- */
  function render() {
    var main = el("#main");
    if (state.view === "docs") main.innerHTML = renderDocs();
    else if (state.view === "cats") main.innerHTML = renderCats();
    else if (state.view === "matrix") main.innerHTML = renderMatrix();
    else if (state.view === "rels") main.innerHTML = renderRels();
    renderRail();

    var tabs = document.querySelectorAll(".viewtab");
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].setAttribute("aria-selected", tabs[i].getAttribute("data-view") === state.view);
    }
    var showRail = state.view === "docs" || state.view === "rels";
    el("#rail").style.visibility = showRail ? "" : "hidden";
    el(".shell").style.gridTemplateColumns = showRail ? "" : "0 minmax(0,1fr)";
  }

  function toggleFacet(facet, code) {
    var arr = state[facet];
    var i = arr.indexOf(code);
    if (i === -1) arr.push(code); else arr.splice(i, 1);
    render();
  }

  /* ---- events ---------------------------------------------------------- */
  document.addEventListener("click", function (ev) {
    var t = ev.target;

    var tab = t.closest(".viewtab");
    if (tab) { state.view = tab.getAttribute("data-view"); render(); return; }

    var fopt = t.closest(".fopt");
    if (fopt) { toggleFacet(fopt.getAttribute("data-facet"), fopt.getAttribute("data-code")); return; }

    var af = t.closest(".afchip");
    if (af) {
      if (af.getAttribute("data-clear") === "q") { state.q = ""; el("#q").value = ""; render(); }
      else toggleFacet(af.getAttribute("data-facet"), af.getAttribute("data-code"));
      return;
    }

    if (t.closest("#resetAll")) {
      state.q = ""; el("#q").value = "";
      FACETS.forEach(function (f) { state[f] = []; });
      render(); return;
    }

    var sortEl = t.closest("[data-sort]");
    if (sortEl) {
      var k = sortEl.getAttribute("data-sort");
      if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = 1; }
      render(); return;
    }

    var cc = t.closest("[data-gocat]");
    if (cc) {
      state.cat = [cc.getAttribute("data-gocat")];
      state.view = "docs";
      render(); return;
    }

    var mx = t.closest(".mxcell[data-dm]");
    if (mx) {
      state.domain = [mx.getAttribute("data-dm")];
      state.cat = [mx.getAttribute("data-cat")];
      state.view = "docs";
      render(); return;
    }

    var link = t.closest("[data-id]");
    if (link) { select(link.getAttribute("data-id")); return; }

    if (t.closest("#drawerClose") || t.closest("#scrim")) { closeDrawer(); return; }

    if (t.closest("#railToggle")) {
      var r = el("#rail");
      r.setAttribute("data-open", r.getAttribute("data-open") === "true" ? "false" : "true");
      return;
    }
    if (t.closest("#themeToggle")) {
      var root = document.documentElement;
      var cur = root.getAttribute("data-theme");
      var isDark = cur ? cur === "dark"
        : window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.setAttribute("data-theme", isDark ? "light" : "dark");
      return;
    }
    if (t.closest("#clearQ")) { state.q = ""; el("#q").value = ""; render(); return; }
  });

  el("#q").addEventListener("input", function (e) {
    state.q = e.target.value.trim();
    render();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closeDrawer(); return; }
    if (e.key === "/" && document.activeElement !== el("#q")) {
      e.preventDefault(); el("#q").focus();
    }
  });

  render();
})();
