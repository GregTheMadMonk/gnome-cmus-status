// for all constants and functions accessed from different files
const Gio	= imports.gi.Gio;

const settingsSchema = "org.gnome.shell.extensions.cmus-status";
const needsUpdateKey = "settings-updated";
const updateIntervalKey = "update-interval";
const enableBindsKey = "enable-binds";
const enableNotKey = "enable-notifications";
const simpleTrayKey = "simple-tray";
const notPosXKey = "notification-posx";
const notPosYKey = "notification-posy";
const notFadeStartKey = "notification-fade-start-time";
const notFadeDurationKey = "notification-fade-duration";
const trayFormatKey = "tray-format";
const notFormatKey = "notification-format";

const playBindKey = "play-bind";
const prevBindKey = "prev-bind";
const nextBindKey = "next-bind";

function getSettings(schema)
{
	if (Gio.Settings.list_schemas().indexOf(schema) == -1)
	{
		log("cmus-status: Schema not found!");
		return null;
	}

	log("cmus-status: Schema found. Returning gsettings");
	return new Gio.Settings({ schema: schema });
}

// converts bind ID from settings to accelerator
function bindIdToAccel(bindId)
{
	// if the first character is "#" we should just remove it
	if (bindId.charAt(0) == '#') return bindId.substr(1);

	switch (bindId)
	{
		case "mplay":
			return "XF86AudioPlay";
		case "mnext":
			return "XF86AudioNext";
		case "mprev":
			return "XF86AudioPrev";
		default:
			return "<alt>" + bindId;
	}
}
