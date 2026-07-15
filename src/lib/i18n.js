// Lightweight i18n — a pure, keyed string catalog + resolver, deliberately not
// a framework (see docs/localization-spec.md §Why not react-i18next). Phase 1
// covers the daily COUNT PATH: login, the tab bar, the three count forms, and
// every toast/validation message they raise. Keys are stable dotted names, so
// English copy can be reworded without orphaning the Spanish.
//
// Rules the tests enforce: every locale's key set equals en's (completeness);
// no catalog value is blank; a missing key falls back to English, and a key
// missing everywhere returns the key itself — visible-but-wrong as a dev
// signal, never an empty element.

export const LANG_KEY = "duocount-lang"; // localStorage, sibling of duocount-theme / duocount-fab
export const DEFAULT_LOCALE = "en";
export const LOCALES = ["en", "es"];
export const LOCALE_LABELS = { en: "English", es: "Español" };

export const CATALOG = {
  en: {
    // navigation (tab bar + mobile bottom-nav groups)
    "nav.cash": "Cash",
    "nav.scratch": "Scratch-offs",
    "nav.inventory": "Inventory",
    "nav.log": "Log",
    "nav.notes": "Notes",
    "nav.incidents": "Incidents",
    "nav.time": "Time",
    "nav.dashboard": "Dashboard",
    "nav.portfolio": "Portfolio",
    "nav.admin": "Admin",
    "nav.group_count": "Count",
    "nav.group_team": "Team",
    "nav.group_insights": "Insights",
    "nav.sections": "Sections",
    "nav.close_menu": "Close menu",
    "nav.need_attention": "{n} need attention",

    // login
    "login.store_code": "Store code",
    "login.your_pin": "Your PIN ({n} digits)",
    "login.sign_in": "Sign in",
    "login.checking": "Checking…",
    "login.register_link": "New business? Register your store",
    "login.code_help": "Your store code comes from whoever set up your business. Ask a manager if you don't have it.",
    "login.biz_name": "Business name",
    "login.logo_url": "Logo URL (optional)",
    "login.owner_name": "Your name (owner)",
    "login.choose_pin": "Choose your PIN ({n} digits)",
    "login.create": "Create business & sign in",
    "login.creating": "Creating…",
    "login.back_to_login": "Already registered? Sign in",
    "login.signup_help": "You'll get a store code to share with staff. You'll be the owner and can add locations, drawers, and staff in Admin.",
    "login.created_pre": "Store created. Your store code is",
    "login.created_post": "— share it with staff so they can sign in.",
    "login.user_guide": "User guide",
    "login.documentation": "Documentation",

    // language picker
    "lang.language": "Language",

    // shared form vocabulary
    "common.location": "Location",
    "common.date": "Date",
    "common.shift": "Shift",
    "common.opening": "Opening",
    "common.closing": "Closing",
    "common.save_sign": "Save & sign entry",
    "common.saving": "Saving…",
    "common.over_short": "Over / short",
    "common.retry": "Retry",
    "common.retrying": "Retrying…",

    // cash count
    "cash.title": "New drawer count",
    "cash.drawer": "Cash drawer",
    "cash.no_drawers": "No drawers — add in Admin",
    "cash.start": "Starting drawer",
    "cash.sales": "Cash sales",
    "cash.paidout": "Paid out / drops",
    "cash.counted_now": "Counted now",
    "cash.counted_close": "Counted at close",
    "cash.from_counter": "from counter",
    "cash.counter_on": "Counting by denomination",
    "cash.counter_off": "Count cash by denomination",
    "cash.counter_hint_on": "Enter a total instead",
    "cash.counter_hint_off": "Tally the bills",
    "cash.by_denom": "Count by denomination",
    "cash.bills_of": "Number of ${d} bills",
    "cash.coins": "Coins",
    "cash.coins_total": "Coins total in dollars",
    "cash.counter_total": "Counter total",
    "cash.blind": "Blind count",
    "cash.blind_hint": "Result shown after you save",
    "cash.expected": "Expected in drawer",
    "cash.helper_open": "Expected = your starting drawer (an opening count has no sales or paid-outs yet).",
    "cash.helper_close": "Expected = start + sales − paid out.",
    "cash.helper_sig": "Your name, drawer, location, and time stamp attach automatically.",

    // scratch-off count
    "scratch.title": "Scratch-off pack count",
    "scratch.drawer": "Drawer",
    "scratch.active_pack": "Active pack (fills game, price & pack #)",
    "scratch.pick_pack": "Pick a pack…",
    "scratch.bin": "bin {bin}",
    "scratch.game": "Game name",
    "scratch.pack_no": "Pack / book #",
    "scratch.scan_pack": "Scan pack barcode",
    "scratch.price": "Ticket price",
    "scratch.startno": "Start ticket #",
    "scratch.endno": "End ticket #",
    "scratch.sold": "Tickets sold",
    "scratch.dollars": "Dollars sold",
    "scratch.helper": "End # − start # = tickets sold. That × price must match the drawer — this makes the log self-auditing.",
    "scratch.scan_hint": "The scan fills the pack — nothing saves until you save & sign the count.",

    // inventory count
    "inventory.title": "Inventory count",
    "inventory.item": "Item",
    "inventory.no_items": "No items — add in Admin",
    "inventory.scan_item": "Scan item barcode",
    "inventory.search": "Search {n} items…",
    "inventory.search_label": "Search items",
    "inventory.counted": "Counted on hand",
    "inventory.counted_hint": "What's actually on the shelf right now — that's all a quick recount needs.",
    "inventory.movement": "Movement details",
    "inventory.movement_sub": "received · sold · removed",
    "inventory.has_entries": "has entries",
    "inventory.startqty": "Start qty (last count)",
    "inventory.received": "Received (deliveries)",
    "inventory.sold": "Sold since last count",
    "inventory.removed": "Removed (damage/returns)",
    "inventory.expected": "Expected on hand",
    "inventory.helper": "Expected = start + received − sold − removed. Negative over/short means missing stock. Your name, item, location, and time stamp attach automatically.",
    "inventory.scan_title": "Scan to select item",
    "inventory.scan_hint": "The scan just picks the item — nothing saves until you save & sign the count.",

    // toasts (confirmations)
    "toast.saved_cash": "Cash entry signed & saved",
    "toast.saved_scratch": "Scratch-off entry signed & saved",
    "toast.saved_inventory": "Inventory count signed & saved",
    "toast.saved_result": "Saved — {result}",
    "toast.balanced": "balanced",
    "toast.over_amount": "over {amount}",
    "toast.short_amount": "short {amount}",
    "toast.over_units": "over {n} {unit}",
    "toast.short_units": "short {n} {unit}",
    "toast.pack_recognized": "Pack recognized — start # carried from last count",
    "toast.pack_scanned": "Pack scanned",
    "toast.item_selected": "Selected {name}",
    "toast.barcode_no_match": "No item with this barcode here — add it in Admin",

    // validation + save errors
    "err.pick_location": "Pick a location first.",
    "err.pick_drawer": "Pick a drawer first.",
    "err.enter_counted": "Enter the amount you counted.",
    "err.pick_item": "Pick an item to count.",
    "err.enter_onhand": "Enter the amount on hand.",
    "err.enter_numbers": "Enter the start and end ticket numbers.",
    "err.end_lt_start": "The end number can't be less than the start.",
    "err.save_failed": "Couldn't save — check your connection and try again. Your entry wasn't recorded.",

    // confirmations
    "confirm.blind": "You're committing a blind count. Entries can't be edited after saving.",
  },

  es: {
    "nav.cash": "Caja",
    "nav.scratch": "Raspaditos",
    "nav.inventory": "Inventario",
    "nav.log": "Registro",
    "nav.notes": "Notas",
    "nav.incidents": "Incidentes",
    "nav.time": "Horario",
    "nav.dashboard": "Panel",
    "nav.portfolio": "Portafolio",
    "nav.admin": "Admin",
    "nav.group_count": "Contar",
    "nav.group_team": "Equipo",
    "nav.group_insights": "Análisis",
    "nav.sections": "Secciones",
    "nav.close_menu": "Cerrar menú",
    "nav.need_attention": "{n} requieren atención",

    "login.store_code": "Código de tienda",
    "login.your_pin": "Tu PIN ({n} dígitos)",
    "login.sign_in": "Iniciar sesión",
    "login.checking": "Verificando…",
    "login.register_link": "¿Negocio nuevo? Registra tu tienda",
    "login.code_help": "El código de tienda te lo da quien configuró el negocio. Pídeselo a un gerente si no lo tienes.",
    "login.biz_name": "Nombre del negocio",
    "login.logo_url": "URL del logo (opcional)",
    "login.owner_name": "Tu nombre (dueño)",
    "login.choose_pin": "Elige tu PIN ({n} dígitos)",
    "login.create": "Crear negocio e iniciar sesión",
    "login.creating": "Creando…",
    "login.back_to_login": "¿Ya registrado? Inicia sesión",
    "login.signup_help": "Recibirás un código de tienda para compartir con tu personal. Serás el dueño y podrás agregar ubicaciones, cajas y personal en Admin.",
    "login.created_pre": "Tienda creada. Tu código de tienda es",
    "login.created_post": "— compártelo con tu personal para que puedan iniciar sesión.",
    "login.user_guide": "Guía de uso",
    "login.documentation": "Documentación",

    "lang.language": "Idioma",

    "common.location": "Ubicación",
    "common.date": "Fecha",
    "common.shift": "Turno",
    "common.opening": "Apertura",
    "common.closing": "Cierre",
    "common.save_sign": "Guardar y firmar",
    "common.saving": "Guardando…",
    "common.over_short": "Sobra / falta",
    "common.retry": "Reintentar",
    "common.retrying": "Reintentando…",

    "cash.title": "Nuevo conteo de caja",
    "cash.drawer": "Caja registradora",
    "cash.no_drawers": "Sin cajas — agrégalas en Admin",
    "cash.start": "Fondo inicial",
    "cash.sales": "Ventas en efectivo",
    "cash.paidout": "Pagos / retiros",
    "cash.counted_now": "Contado ahora",
    "cash.counted_close": "Contado al cierre",
    "cash.from_counter": "del contador",
    "cash.counter_on": "Contando por denominación",
    "cash.counter_off": "Contar por denominación",
    "cash.counter_hint_on": "Ingresar un total",
    "cash.counter_hint_off": "Cuenta los billetes",
    "cash.by_denom": "Conteo por denominación",
    "cash.bills_of": "Cantidad de billetes de ${d}",
    "cash.coins": "Monedas",
    "cash.coins_total": "Total de monedas en dólares",
    "cash.counter_total": "Total del contador",
    "cash.blind": "Conteo ciego",
    "cash.blind_hint": "El resultado se muestra al guardar",
    "cash.expected": "Esperado en caja",
    "cash.helper_open": "Esperado = tu fondo inicial (un conteo de apertura aún no tiene ventas ni pagos).",
    "cash.helper_close": "Esperado = fondo + ventas − pagos.",
    "cash.helper_sig": "Tu nombre, caja, ubicación y hora se registran automáticamente.",

    "scratch.title": "Conteo de raspaditos",
    "scratch.drawer": "Caja",
    "scratch.active_pack": "Paquete activo (llena juego, precio y n.º)",
    "scratch.pick_pack": "Elige un paquete…",
    "scratch.bin": "casilla {bin}",
    "scratch.game": "Nombre del juego",
    "scratch.pack_no": "N.º de paquete / libro",
    "scratch.scan_pack": "Escanear código del paquete",
    "scratch.price": "Precio del boleto",
    "scratch.startno": "Boleto inicial n.º",
    "scratch.endno": "Boleto final n.º",
    "scratch.sold": "Boletos vendidos",
    "scratch.dollars": "Dólares vendidos",
    "scratch.helper": "N.º final − n.º inicial = boletos vendidos. Eso × el precio debe cuadrar con la caja — así el registro se audita solo.",
    "scratch.scan_hint": "El escaneo llena el paquete — nada se guarda hasta que guardes y firmes el conteo.",

    "inventory.title": "Conteo de inventario",
    "inventory.item": "Artículo",
    "inventory.no_items": "Sin artículos — agrégalos en Admin",
    "inventory.scan_item": "Escanear código del artículo",
    "inventory.search": "Buscar {n} artículos…",
    "inventory.search_label": "Buscar artículos",
    "inventory.counted": "Contado en existencia",
    "inventory.counted_hint": "Lo que hay en el estante ahora mismo — es todo lo que necesita un reconteo rápido.",
    "inventory.movement": "Detalles de movimiento",
    "inventory.movement_sub": "recibido · vendido · retirado",
    "inventory.has_entries": "con datos",
    "inventory.startqty": "Cantidad inicial (último conteo)",
    "inventory.received": "Recibido (entregas)",
    "inventory.sold": "Vendido desde el último conteo",
    "inventory.removed": "Retirado (daños/devoluciones)",
    "inventory.expected": "Esperado en existencia",
    "inventory.helper": "Esperado = inicial + recibido − vendido − retirado. Un resultado negativo significa mercancía faltante. Tu nombre, artículo, ubicación y hora se registran automáticamente.",
    "inventory.scan_title": "Escanear para elegir artículo",
    "inventory.scan_hint": "El escaneo solo elige el artículo — nada se guarda hasta que guardes y firmes el conteo.",

    "toast.saved_cash": "Entrada de caja firmada y guardada",
    "toast.saved_scratch": "Entrada de raspaditos firmada y guardada",
    "toast.saved_inventory": "Conteo de inventario firmado y guardado",
    "toast.saved_result": "Guardado — {result}",
    "toast.balanced": "cuadrado",
    "toast.over_amount": "sobra {amount}",
    "toast.short_amount": "falta {amount}",
    "toast.over_units": "sobran {n} {unit}",
    "toast.short_units": "faltan {n} {unit}",
    "toast.pack_recognized": "Paquete reconocido — el n.º inicial viene del último conteo",
    "toast.pack_scanned": "Paquete escaneado",
    "toast.item_selected": "Seleccionado: {name}",
    "toast.barcode_no_match": "Ningún artículo con este código aquí — agrégalo en Admin",

    "err.pick_location": "Primero elige una ubicación.",
    "err.pick_drawer": "Primero elige una caja.",
    "err.enter_counted": "Ingresa el monto contado.",
    "err.pick_item": "Elige un artículo para contar.",
    "err.enter_onhand": "Ingresa la cantidad en existencia.",
    "err.enter_numbers": "Ingresa los números de boleto inicial y final.",
    "err.end_lt_start": "El número final no puede ser menor que el inicial.",
    "err.save_failed": "No se pudo guardar — revisa tu conexión e inténtalo de nuevo. Tu entrada no quedó registrada.",

    "confirm.blind": "Vas a registrar un conteo ciego. Las entradas no se pueden editar después de guardar.",
  },
};

// Resolve a key against a locale: active locale → English → the key itself
// (visible-but-wrong dev signal, never blank). {vars} interpolate; a missing
// var leaves its {placeholder} literal rather than printing undefined.
export function translate(locale, key, vars) {
  const s = CATALOG[locale]?.[key] ?? CATALOG[DEFAULT_LOCALE][key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`)) : s;
}

// A stored locale that isn't shipped falls through to the default — same
// posture as resolveTheme() with a corrupt theme value.
export function resolveLocale(stored) {
  return LOCALES.includes(stored) ? stored : DEFAULT_LOCALE;
}
