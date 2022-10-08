// for all constants and functions accessed from different files
const ExtensionUtils 	= imports.misc.extensionUtils;
const Extension 	= ExtensionUtils.getCurrentExtension();
const Gio		= imports.gi.Gio;
const GioSSS		= Gio.SettingsSchemaSource;

function exports() {
	return {
		settingsSchema:		"org.gnome.shell.extensions.cmus-status",
		needsUpdateKey:		"settings-updated",
		updateIntervalKey:	"update-interval",
		enableBindsKey:		"enable-binds",
		enableNotKey:		"enable-notifications",
		simpleTrayKey:		"simple-tray",
		notPosXKey:		"notification-posx",
		notPosYKey:		"notification-posy",
		notFadeStartKey:	"notification-fade-start-time",
		notFadeDurationKey:	"notification-fade-duration",
		trayFormatKey:		"tray-format",
		notFormatKey:		"notification-format",

		playBindKey:		"play-bind",
		prevBindKey:		"prev-bind",
		nextBindKey:		"next-bind"
	};
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
