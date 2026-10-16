/*
 * ============================================================
 *  PANIER — le seul fichier JavaScript du site
 * ============================================================
 *
 * Le reste du site est en HTML / CSS. Ce fichier sert uniquement à
 * MÉMORISER le panier (dans le navigateur du client, localStorage) :
 *
 *  1. Fiche produit : « Commander » ajoute le produit choisi au panier
 *     puis ouvre le panier ; « Ajouter au panier » l'ajoute et reste sur la page.
 *  2. Page Panier : affiche les articles, quantités, suppression, livraison, total.
 *  3. Page Commande : affiche le contenu du panier dans le récapitulatif et
 *     l'envoie avec le formulaire (champs cachés « panier » et « total »).
 *  4. Page Merci / Paiement accepté : vide le panier.
 *  5. En-tête : nombre d'articles sur l'icône du panier.
 *
 * Aucune donnée de carte bancaire n'est lue ni enregistrée ici.
 *
 * Livraison en France : tarif fixe de 6 €.
 */
(function () {
  "use strict";

  var CLE = "panier-bois-chauffage";

  /* ---------- Tarifs de livraison ---------- */
  var PAYS = [
    ["FR", "France"],
    ["BE", "Belgique"],
    ["LU", "Luxembourg"],
    ["CH", "Suisse"],
    ["DE", "Allemagne"],
    ["NL", "Pays-Bas"],
    ["ES", "Espagne"],
    ["IT", "Italie"],
    ["AUTRE", "Autre pays européen"],
  ];
  var TARIF_FRANCE = 6;
  var MESSAGE_DEVIS =
    "Le tarif de livraison dépend de la destination. Contactez-nous pour obtenir votre tarif.";

  /* ---------- Outils ---------- */
  var eur0 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  var eur2 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
  function prix(n) {
    return Number.isInteger(n) ? eur0.format(n) : eur2.format(n);
  }
  function arrondi(n) {
    return Math.round(n * 100) / 100;
  }
  function el(tag, classes, texte) {
    var e = document.createElement(tag);
    if (classes) e.className = classes;
    if (texte !== undefined) e.textContent = texte;
    return e;
  }
  function chemin(p) {
    // Les pages Panier et Commande sont à la racine du site : chemins relatifs
    return p ? p.replace(/^\//, "") : p;
  }

  /* ---------- Stockage ---------- */
  function lire() {
    try {
      var d = JSON.parse(localStorage.getItem(CLE) || "{}");
      return { lignes: Array.isArray(d.lignes) ? d.lignes : [], pays: d.pays || "FR", cp: d.cp || "" };
    } catch (e) {
      return { lignes: [], pays: "FR", cp: "" };
    }
  }
  function ecrire(etat) {
    try {
      localStorage.setItem(CLE, JSON.stringify(etat));
    } catch (e) {}
    majCompteur();
  }

  /* ---------- Calculs ---------- */
  function totalLigne(l) {
    if (l.kind === "stere") {
      var t = (l.grid || []).filter(function (x) {
        return x.q === l.qty;
      })[0];
      return t ? t.prix : null;
    }
    return l.price === null || l.price === undefined ? null : arrondi(l.price * l.qty);
  }
  function livraison(lignes, pays, cp) {
    if (!pays) return { etat: "incomplet", texte: "Choisissez un pays de livraison." };
    if (pays !== "FR") return { etat: "devis", texte: MESSAGE_DEVIS };
    if (!cp) return { etat: "incomplet", texte: "Indiquez votre code postal pour estimer la livraison." };
    if (!/^\d{5}$/.test(cp.trim())) return { etat: "incomplet", texte: "Code postal invalide (5 chiffres attendus)." };
    return { etat: "prix", montant: TARIF_FRANCE, texte: "France" };
  }
  function resume(etat) {
    var lignes = etat.lignes;
    var sousTotal = arrondi(
      lignes.reduce(function (s, l) {
        return s + (totalLigne(l) || 0);
      }, 0),
    );
    var surDemande = lignes.some(function (l) {
      return totalLigne(l) === null;
    });
    var liv = livraison(lignes, etat.pays, etat.cp);
    var total = !surDemande && liv.etat === "prix" ? arrondi(sousTotal + liv.montant) : null;
    return { sousTotal: sousTotal, surDemande: surDemande, livraison: liv, total: total };
  }
  function libelleQuantite(l) {
    if (l.kind === "stere") return l.qty + (l.qty > 1 ? " stères" : " stère");
    var u = l.unit || { singulier: "article", pluriel: "articles" };
    return l.qty + " " + (l.qty > 1 ? u.pluriel : u.singulier);
  }
  function nbArticles(lignes) {
    return lignes.reduce(function (s, l) {
      return s + (l.kind === "stere" ? 1 : l.qty);
    }, 0);
  }

  /* ---------- Ajout au panier (fiches produit et cartes des poêles) ---------- */
  function articleChoisi(bouton) {
    var direct = bouton.getAttribute("data-panier-article");
    if (direct) {
      var a = JSON.parse(direct);
      return {
        key: a.slug + "::" + a.variant.id,
        slug: a.slug,
        name: a.name,
        image: a.image,
        kind: "unit",
        variantId: a.variant.id,
        label: a.variant.label,
        price: a.variant.price,
        unit: a.variant.unit,
        steres: a.variant.steres,
        qty: 1,
      };
    }
    var bloc = bouton.closest("[data-panier-produit]");
    if (!bloc) return null;
    var p = JSON.parse(bloc.getAttribute("data-panier-produit"));

    if (p.kind === "stere") {
      var rl = bloc.querySelector("input[data-longueur]:checked");
      var rq = bloc.querySelector("input[data-quantite]:checked");
      if (!rl || !rq) return null;
      var longueur = Number(rl.getAttribute("data-longueur"));
      var q = Number(rq.getAttribute("data-quantite"));
      var v = p.variants.filter(function (x) {
        return x.lengthCm === longueur;
      })[0];
      if (!v) return null;
      return {
        key: p.slug + "::" + v.id,
        slug: p.slug,
        name: p.name,
        image: p.image,
        kind: "stere",
        variantId: v.id,
        label: v.label,
        lengthCm: longueur,
        grid: p.grids[longueur],
        qty: q,
      };
    }

    // Produit à l'unité : la variante correspond aux options cochées
    var choix = {};
    bloc.querySelectorAll("input[data-axe]:checked").forEach(function (r) {
      choix[r.getAttribute("data-axe")] = r.getAttribute("data-valeur");
    });
    var variante = p.variants.filter(function (x) {
      return p.axes.every(function (a) {
        return x.options[a] === choix[a];
      });
    })[0];
    if (!variante) return { erreur: "Cette combinaison n'est pas proposée : choisissez une autre option." };
    var champ = bloc.querySelector("#sel-quantite");
    var qte = Math.min(999, Math.max(1, parseInt(champ && champ.value, 10) || 1));
    return {
      key: p.slug + "::" + variante.id,
      slug: p.slug,
      name: p.name,
      image: p.image,
      kind: "unit",
      variantId: variante.id,
      label: variante.label,
      price: variante.price,
      unit: variante.unit,
      steres: variante.steres,
      qty: qte,
    };
  }

  function ajouter(article) {
    var etat = lire();
    var existante = etat.lignes.filter(function (l) {
      return l.key === article.key;
    })[0];
    if (existante) {
      // Au stère : la quantité est remplacée ; à l'unité : elle s'additionne
      existante.qty = article.kind === "stere" ? article.qty : Math.min(999, existante.qty + article.qty);
    } else {
      etat.lignes.push(article);
    }
    ecrire(etat);
  }

  document.addEventListener("click", function (e) {
    var bouton = e.target.closest("[data-panier]");
    if (!bouton) return;
    var article = articleChoisi(bouton);
    if (!article) return; // le lien mène simplement au panier
    e.preventDefault();
    var bloc = bouton.closest("[data-panier-produit]");
    var confirmation = bloc && bloc.querySelector("[data-panier-confirmation]");
    if (article.erreur) {
      if (confirmation) {
        confirmation.hidden = false;
        confirmation.textContent = article.erreur;
      }
      return;
    }
    ajouter(article);
    if (bouton.getAttribute("data-panier") === "commander") {
      window.location.href = bouton.href;
    } else if (confirmation) {
      confirmation.hidden = false;
    } else {
      bouton.textContent = "Ajouté ✓";
    }
  });

  /* ---------- Compteur de l'en-tête ---------- */
  function majCompteur() {
    var n = nbArticles(lire().lignes);
    document.querySelectorAll("[data-panier-compteur]").forEach(function (b) {
      b.textContent = n > 99 ? "99+" : String(n);
      b.hidden = n === 0;
    });
  }

  /* ---------- Page Panier ---------- */
  function pagePanier(zone) {
    var etat = lire();
    if (!etat.lignes.length) return; // la page affiche déjà « Votre panier »
    var r = resume(etat);
    zone.innerHTML = "";

    var grille = el("div", "container-page grid gap-8 py-8 sm:py-12 lg:grid-cols-[1fr_380px] lg:gap-12");
    var section = el("section");
    section.setAttribute("aria-label", "Articles du panier");
    var liste = el("ul", "divide-y divide-cream-300 rounded-xl border border-cream-300 bg-white");

    etat.lignes.forEach(function (l, index) {
      var li = el("li", "flex gap-4 p-4 sm:p-5");
      var lienImg = el("a", "relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-cream-200 sm:h-24 sm:w-24");
      lienImg.href = "produit/" + l.slug + ".html";
      if (l.image) {
        var img = el("img");
        img.src = chemin(l.image);
        img.alt = "";
        img.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover";
        lienImg.appendChild(img);
      }
      li.appendChild(lienImg);

      var corps = el("div", "flex min-w-0 flex-1 flex-col gap-3");
      var haut = el("div", "flex items-start justify-between gap-3");
      var infos = el("div", "min-w-0");
      var nom = el("a", "font-semibold text-bark-900 hover:text-ember-700", l.name);
      nom.href = "produit/" + l.slug + ".html";
      infos.appendChild(nom);
      infos.appendChild(el("p", "mt-0.5 text-sm text-bark-600", l.label));
      var pu = totalLigne(l);
      infos.appendChild(
        el(
          "p",
          "mt-0.5 text-sm text-bark-600",
          l.kind === "stere"
            ? pu !== null
              ? "soit " + prix(arrondi(pu / l.qty)) + " / stère"
              : ""
            : l.price !== null && l.price !== undefined
              ? prix(l.price) + " / " + l.unit.singulier
              : "Prix sur demande",
        ),
      );
      haut.appendChild(infos);
      var suppr = el(
        "button",
        "-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-bark-500 hover:bg-cream-100 hover:text-red-700",
        "✕",
      );
      suppr.type = "button";
      suppr.setAttribute("aria-label", "Supprimer " + l.name + " du panier");
      suppr.addEventListener("click", function () {
        var e2 = lire();
        e2.lignes.splice(index, 1);
        ecrire(e2);
        if (!e2.lignes.length) window.location.reload();
        else pagePanier(zone);
      });
      haut.appendChild(suppr);
      corps.appendChild(haut);

      var bas = el("div", "flex flex-wrap items-center justify-between gap-3");
      var champ;
      if (l.kind === "stere") {
        champ = el("select", "field !w-auto min-w-44 font-semibold");
        (l.grid || []).forEach(function (t) {
          var o = el("option", "", t.q + (t.q > 1 ? " stères" : " stère"));
          o.value = t.q;
          if (t.q === l.qty) o.selected = true;
          champ.appendChild(o);
        });
      } else {
        champ = el(
          "input",
          "h-12 w-24 rounded-lg border border-cream-400 bg-white px-3 text-center text-base font-semibold outline-none focus:bg-cream-50",
        );
        champ.type = "number";
        champ.min = 1;
        champ.max = 999;
        champ.value = l.qty;
      }
      champ.setAttribute("aria-label", "Quantité pour " + l.name);
      champ.addEventListener("change", function () {
        var e2 = lire();
        var q = parseInt(champ.value, 10) || 1;
        e2.lignes[index].qty = l.kind === "stere" ? q : Math.min(999, Math.max(1, q));
        ecrire(e2);
        pagePanier(zone);
      });
      bas.appendChild(champ);
      var tl = totalLigne(l);
      bas.appendChild(el("p", "font-semibold text-bark-900", tl !== null ? prix(tl) : "Sur demande"));
      corps.appendChild(bas);
      li.appendChild(corps);
      liste.appendChild(li);
    });
    section.appendChild(liste);
    var continuer = el("a", "btn btn-outline mt-6 w-full sm:w-auto", "← Continuer mes achats");
    continuer.href = "bois.html";
    section.appendChild(continuer);
    grille.appendChild(section);

    // Livraison + récapitulatif
    var cote = el("aside", "space-y-6 lg:sticky lg:top-28 lg:self-start");
    cote.setAttribute("aria-label", "Récapitulatif");

    var boiteLiv = el("div", "rounded-xl border border-cream-300 bg-white p-5 sm:p-6");
    boiteLiv.appendChild(el("h2", "font-serif text-xl font-semibold text-bark-900", "Livraison"));
    var g = el("div", "mt-4 grid gap-4");
    var lp = el("label", "field-label", "Pays de livraison");
    lp.htmlFor = "cart-country";
    var selPays = el("select", "field");
    selPays.id = "cart-country";
    PAYS.forEach(function (p) {
      var o = el("option", "", p[1]);
      o.value = p[0];
      if (p[0] === etat.pays) o.selected = true;
      selPays.appendChild(o);
    });
    var blocPays = el("div");
    blocPays.appendChild(lp);
    blocPays.appendChild(selPays);
    g.appendChild(blocPays);
    if (etat.pays === "FR") {
      var lc = el("label", "field-label", "Code postal");
      lc.htmlFor = "cart-cp";
      var cp = el("input", "field");
      cp.id = "cart-cp";
      cp.inputMode = "numeric";
      cp.maxLength = 5;
      cp.placeholder = "ex. 75001";
      cp.value = etat.cp;
      cp.addEventListener("input", function () {
        var e2 = lire();
        e2.cp = cp.value.replace(/\D/g, "").slice(0, 5);
        ecrire(e2);
        if (e2.cp.length === 5 || e2.cp.length === 0) pagePanier(zone);
      });
      var blocCp = el("div");
      blocCp.appendChild(lc);
      blocCp.appendChild(cp);
      g.appendChild(blocCp);
    }
    selPays.addEventListener("change", function () {
      var e2 = lire();
      e2.pays = selPays.value;
      ecrire(e2);
      pagePanier(zone);
    });
    g.appendChild(blocLivraison(r.livraison));
    boiteLiv.appendChild(g);
    cote.appendChild(boiteLiv);

    var boiteRecap = el("div", "rounded-xl border border-cream-300 bg-white p-5 sm:p-6");
    boiteRecap.appendChild(el("h2", "font-serif text-xl font-semibold text-bark-900", "Récapitulatif"));
    var totaux = blocTotaux(r);
    totaux.classList.add("mt-4");
    boiteRecap.appendChild(totaux);
    var passer = el("a", "btn btn-primary mt-6 w-full", "Passer commande");
    passer.href = "commande.html";
    boiteRecap.appendChild(passer);
    if (r.total === null) {
      boiteRecap.appendChild(
        el(
          "p",
          "mt-3 text-xs leading-relaxed text-bark-600",
          "Le prix de la livraison vous est communiqué avant la validation définitive de votre commande.",
        ),
      );
    }
    cote.appendChild(boiteRecap);
    grille.appendChild(cote);
    zone.appendChild(grille);
    if (etat.pays === "FR" && etat.cp && document.activeElement !== document.getElementById("cart-cp")) {
      // conserve la saisie en cours
    }
  }

  function blocLivraison(liv) {
    if (liv.etat === "prix") {
      var d = el("div", "rounded-lg bg-forest-50 p-4 text-forest-800");
      d.appendChild(el("p", "font-semibold", "Livraison estimée : " + prix(liv.montant)));
      d.appendChild(el("p", "mt-1 text-sm", liv.texte));
      return d;
    }
    if (liv.etat === "devis") {
      var d2 = el("div", "rounded-lg border border-cream-300 bg-cream-100 p-4 text-bark-800");
      d2.appendChild(el("p", "font-semibold", "Livraison sur devis"));
      d2.appendChild(el("p", "mt-1 text-sm leading-relaxed", liv.texte));
      return d2;
    }
    return el("p", "text-sm text-bark-600", liv.texte);
  }

  function blocTotaux(r) {
    var dl = el("dl", "space-y-3 text-sm");
    function ligne(dt, dd, classesDd) {
      var d = el("div", "flex justify-between gap-4");
      d.appendChild(el("dt", "text-bark-600", dt));
      d.appendChild(el("dd", classesDd || "text-right font-medium text-bark-900", dd));
      dl.appendChild(d);
    }
    ligne("Produits", prix(r.sousTotal) + (r.surDemande ? " + produits sur demande" : ""));
    ligne(
      "Livraison",
      r.livraison.etat === "prix"
        ? prix(r.livraison.montant)
        : r.livraison.etat === "devis"
          ? "Sur devis"
          : "À calculer",
    );
    var t = el("div", "flex items-baseline justify-between gap-4 border-t border-cream-300 pt-3");
    t.appendChild(el("dt", "text-base font-semibold text-bark-900", "Total"));
    var dd = el("dd", "text-right font-serif text-2xl font-semibold text-bark-900");
    if (r.total !== null) dd.textContent = prix(r.total);
    else {
      dd.textContent = prix(r.sousTotal);
      dd.appendChild(el("span", "block font-sans text-xs font-normal text-bark-500", "+ livraison (sur devis)"));
    }
    t.appendChild(dd);
    dl.appendChild(t);
    return dl;
  }

  /* ---------- Page Commande ---------- */
  function pageCommande(form) {
    var etat = lire();
    if (!etat.lignes.length) return; // panier vide : choix manuel du produit (page HTML)

    // Le choix manuel du produit est masqué : le contenu du panier est envoyé à la place
    var selection = form.querySelector("[data-panier-selection]");
    if (selection) {
      selection.hidden = true;
      selection.querySelectorAll("select, input").forEach(function (c) {
        c.disabled = true; // un champ désactivé n'est pas envoyé
      });
    }
    function cache(nom) {
      var c = form.querySelector('input[type="hidden"][name="' + nom + '"]');
      if (!c) {
        c = el("input");
        c.type = "hidden";
        c.name = nom;
        form.appendChild(c);
      }
      return c;
    }

    var pays = form.querySelector(".nojs-country");
    var cp = form.querySelector(".nojs-cp");
    if (pays && etat.pays) pays.value = etat.pays;
    if (cp && etat.cp && !cp.value) cp.value = etat.cp;

    var zone = form.querySelector("[data-panier-recap]");
    var statique = form.querySelector("[data-panier-recap-statique]");
    if (statique) statique.hidden = true;

    function maj() {
      var e2 = lire();
      e2.pays = pays ? pays.value : e2.pays;
      e2.cp = cp ? cp.value.trim() : e2.cp;
      var r = resume(e2);
      if (zone) {
        zone.hidden = false;
        zone.innerHTML = "";
        var ul = el("ul", "mt-3 divide-y divide-cream-200");
        e2.lignes.forEach(function (l) {
          var li = el("li", "flex gap-3 py-3");
          var vignette = el("div", "relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-cream-200");
          if (l.image) {
            var img = el("img");
            img.src = chemin(l.image);
            img.alt = "";
            img.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover";
            vignette.appendChild(img);
          }
          li.appendChild(vignette);
          var t = el("div", "min-w-0 flex-1 text-sm");
          t.appendChild(el("p", "font-medium text-bark-900", l.name));
          t.appendChild(el("p", "text-bark-600", libelleQuantite(l) + " · " + l.label));
          li.appendChild(t);
          var tl = totalLigne(l);
          li.appendChild(el("p", "text-sm font-semibold text-bark-900", tl !== null ? prix(tl) : "Sur demande"));
          ul.appendChild(li);
        });
        zone.appendChild(ul);
        var bt = el("div", "mt-3 border-t border-cream-300 pt-3");
        bt.appendChild(blocTotaux(r));
        zone.appendChild(bt);
        var modif = el("a", "mt-3 inline-block text-sm font-semibold text-ember-700 underline", "Modifier le panier");
        modif.href = "panier.html";
        zone.appendChild(modif);
      }

      // Champs envoyés avec la commande
      cache("produit").value = e2.lignes
        .map(function (l) {
          return l.name;
        })
        .join(" | ");
      cache("quantite").value = e2.lignes.map(libelleQuantite).join(" | ");
      cache("panier").value = e2.lignes
        .map(function (l) {
          var tl = totalLigne(l);
          return (
            "- " +
            l.name +
            " — " +
            l.label +
            " — " +
            libelleQuantite(l) +
            " — " +
            (tl !== null ? prix(tl) : "prix sur demande")
          );
        })
        .join("\n");
      cache("total").value =
        "Produits : " +
        prix(r.sousTotal) +
        (r.surDemande ? " + produits sur demande" : "") +
        " | Livraison : " +
        (r.livraison.etat === "prix" ? prix(r.livraison.montant) : "sur devis / à calculer") +
        " | Total : " +
        (r.total !== null ? prix(r.total) : "à confirmer");

      // Paiement par carte impossible si un produit est « prix sur demande »
      if (r.surDemande) {
        form.querySelectorAll(".nojs-card-ready").forEach(function (b) {
          b.style.display = "none";
        });
        form.querySelectorAll(".nojs-card-waiting").forEach(function (b) {
          b.style.display = "block";
          var p = b.querySelector("p");
          if (p)
            p.textContent =
              "Un article de votre commande est sur devis : le paiement en ligne n’est pas possible pour cette commande.";
        });
      }
    }
    maj();
    if (pays) pays.addEventListener("change", maj);
    if (cp) cp.addEventListener("input", maj);
    form.addEventListener("submit", function () {
      maj();
      var e2 = lire();
      if (pays) e2.pays = pays.value;
      if (cp) e2.cp = cp.value.trim();
      ecrire(e2);
    });
  }

  /* ---------- Démarrage ---------- */
  function demarrer() {
    var p = window.location.pathname;
    // Après l'envoi de la commande : le panier est vidé
    if (/\/merci(\.html)?$/.test(p) || /paiement-valide(\.html)?$/.test(p)) {
      var e = lire();
      e.lignes = [];
      ecrire(e);
    }
    majCompteur();
    var zonePanier = document.querySelector("[data-panier-page]");
    if (zonePanier) pagePanier(zonePanier);
    var formCommande = document.querySelector('form[name="commande"]');
    if (formCommande) pageCommande(formCommande);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer);
  else demarrer();
})();
