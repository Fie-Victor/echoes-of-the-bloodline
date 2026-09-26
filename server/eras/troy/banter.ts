import type { EraBanter, EraCombatGuidance } from "../types.ts";

export const TROY_BANTER: EraBanter = {
  idleCompanionLines: [
    "Agent, regarde Achille près du feu. L'affront d'Agamemnon ronge son honneur, mais le guerrier en lui n'attend qu'une étincelle.",
    "Rappelle-lui sa soif de gloire immortelle ! Les héros grecs vivent pour que leur nom traverse les âges.",
    "Les vigies annoncent du mouvement vers les murailles. Si les Troyens atteignent les navires, le continuum s'effondrera.",
    "Garde ta lance bien en main. Cette époque ne tolère aucune hésitation.",
    "Le camp semble calme, mais la tension est palpable. Parle à Achille, propose-lui d'aller au combat à ses côtés !",
    "Attention où tu poses les pieds, les rochers sont escarpés près du rivage.",
    "Achille observe l'horizon marin. Il hésite encore entre rentrer en Phthie et entrer dans la légende.",
  ],
  landmarkLines: [
    {
      trigger: "cliff",
      text: "Attention au bord de la falaise ! Les vagues de la mer Égée s'écrasent violemment en contrebas.",
    },
    {
      trigger: "fire_pit",
      text: "Le foyer d'Achille crépite encore. C'est ici qu'il médite ses victoires et sa fureur.",
    },
    {
      trigger: "tent",
      text: "C'est la tente du chef des Myrmidons. Le sceau temporel anormal doit être à l'intérieur.",
    },
  ],
};

export const TROY_COMBAT_GUIDANCE: EraCombatGuidance = {
  dangerWarnings: [
    "Attention ! Attaque imminente à ta droite !",
    "Garde levée ! Une lance troyenne plonge vers toi !",
    "Danger immédiat, prépare-toi !",
    "Deux guerriers convergent sur ta position !",
  ],
  dodgeCallouts: [
    "Esquive maintenant ! Appuie sur [ESPACE] !",
    "Attention derrière toi ! Roule pour esquiver !",
    "Plonge sur le côté !",
    "Trop près, dégage la zone !",
  ],
  attackOpenings: [
    "L'ennemi a baissé sa garde, frappe maintenant [CLIC GAUCHE] !",
    "Belle esquive ! Contre-attaque avec ta lance !",
    "Le flanc est découvert, attaque !",
    "Bien touché ! Poursuis l'assaut !",
  ],
  flankWarnings: [
    "Achille charge en première ligne, protège son flanc gauche !",
    "Reste groupé avec Achille, il enfonce les rangs ennemis !",
    "Un hoplite tente de te contourner par la gauche !",
    "Ne te laisse pas encercler, recule vers Achille !",
  ],
  victoryLines: [
    "La ligne troyenne cède ! Les survivants battent en retraite !",
    "Victoire ! Achille et toi avez repoussé l'assaut sur les navires !",
    "Le continuum se stabilise, la brèche temporelle s'est ouverte !",
  ],
};
