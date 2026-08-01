// Shortcode → Unicode-Zeichen für die Emoji-Eingabe auf /config/morgengruss-emojis.
//
// WARUM HANDGEPFLEGT: Discord gibt Emojis an vielen Stellen als Shortcode-Text aus
// (`:cookie:`, `:wave:`) - kopiert man das ins Eingabefeld, sah es für Nutzende völlig richtig
// aus, wurde aber abgelehnt, weil `:name:` nur gegen die Server-Emojis aufgelöst wurde. Eine
// Dependency (emojibase/node-emoji) würde für dieses Randfeature ein paar tausend Namen
// mitschleppen und widerspricht dem Minimal-Deps-Stil des Projekts (HTML-Parsing, Cookies und
// OAuth sind hier alle von Hand). Diese Liste deckt die gängigen Fälle ab; alles andere wird
// weiterhin sauber abgelehnt, statt still etwas Falsches zu speichern.
//
// Namen sind die von Discord verwendeten Shortcodes, Schlüssel durchgehend kleingeschrieben
// (die Suche normalisiert die Eingabe). Erweitern ist billig - eine Zeile.
//
// DIE POOL-EMOJIS AUS greeting.handler (GRUSS_EMOJIS) STEHEN ALLE DRIN: sie sind die
// abgeleiteten Vorgaben, also genau das, was jemand beim Korrigieren am ehesten nachtippt.
export const EMOJI_SHORTCODES: Record<string, string> = {
    // Der GRUSS_EMOJIS-Pool
    sunny: '☀️',
    sunrise: '🌅',
    sun_with_face: '🌞',
    sunflower: '🌻',
    rainbow: '🌈',
    coffee: '☕',
    tulip: '🌷',
    blossom: '🌼',
    four_leaf_clover: '🍀',
    bird: '🐦',
    white_sun_small_cloud: '🌤️',
    dove: '🕊️',

    // Essen & Trinken
    cookie: '🍪',
    cake: '🍰',
    pizza: '🍕',
    beer: '🍺',
    tea: '🍵',
    doughnut: '🍩',
    strawberry: '🍓',
    apple: '🍎',
    bread: '🍞',
    cheese: '🧀',
    popcorn: '🍿',
    ice_cream: '🍨',

    // Tiere
    dog: '🐶',
    cat: '🐱',
    fox: '🦊',
    bear: '🐻',
    panda_face: '🐼',
    penguin: '🐧',
    hedgehog: '🦔',
    whale: '🐳',
    shark: '🦈',
    dolphin: '🐬',
    turtle: '🐢',
    frog: '🐸',
    owl: '🦉',
    bee: '🐝',
    butterfly: '🦋',
    snail: '🐌',
    dragon: '🐉',
    dragon_face: '🐲',
    unicorn: '🦄',

    // Pflanzen & Natur
    herb: '🌿',
    cactus: '🌵',
    mushroom: '🍄',
    maple_leaf: '🍁',
    evergreen_tree: '🌲',
    cherry_blossom: '🌸',
    rose: '🌹',
    hibiscus: '🌺',
    seedling: '🌱',
    crescent_moon: '🌙',
    star: '⭐',
    star2: '🌟',
    snowflake: '❄️',
    umbrella: '☔',
    zap: '⚡',
    fire: '🔥',
    droplet: '💧',
    ocean: '🌊',

    // Gegenstände & Symbole
    sparkles: '✨',
    tada: '🎉',
    balloon: '🎈',
    gift: '🎁',
    crown: '👑',
    gem: '💎',
    trophy: '🏆',
    medal: '🏅',
    rocket: '🚀',
    anchor: '⚓',
    hourglass: '⌛',
    bulb: '💡',
    books: '📚',
    book: '📖',
    pencil: '📝',
    art: '🎨',
    game_die: '🎲',
    video_game: '🎮',
    musical_note: '🎵',
    headphones: '🎧',
    guitar: '🎸',
    camera: '📷',
    key: '🔑',
    hammer: '🔨',
    shield: '🛡️',
    crossed_swords: '⚔️',
    axe: '🪓',
    scroll: '📜',
    crystal_ball: '🔮',
    teddy_bear: '🧸',

    // Gesten & Gesichter
    wave: '👋',
    '+1': '👍',
    '-1': '👎',
    ok_hand: '👌',
    clap: '👏',
    pray: '🙏',
    muscle: '💪',
    smile: '😄',
    grin: '😁',
    wink: '😉',
    thinking: '🤔',
    sleeping: '😴',
    sunglasses: '😎',
    heart: '❤️',
    sparkling_heart: '💖',
    ghost: '👻',
    alien: '👽',
    robot: '🤖',
};
