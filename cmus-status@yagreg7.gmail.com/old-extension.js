const St = imports.gi.St;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const GLib = imports.gi.GLib;
const Mainloop = imports.mainloop;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;

let text, button, next_button, prev_button, main_box;

let _status = { state: "off", title: "title", album: "album", artist: "artist" };
let status_label;
let status_icon;

let fadeStartTime = 2;
let fadeDuration = 5;

let tray_format = "%a% - %t%";
let notify_format = "%a% - %t% (%al%)";

let hideIndex = 0;
let trayed = false;

// notification position
let vPos = 2;
let hPos = 2;

// keybindings
const PLAY_BUTTON = "<alt>c";
const PREV_BUTTON = "<alt>x";
const NEXT_BUTTON = "<alt>v";
let playCode;
let prevCode;
let nextCode;

let notification = // notification settings
{ 
	vPos: 2, hPos: 2, 
	fadeStartTime: 2, fadeDuration: 5, 
	hideIndex: 0,

	show: new function()
	{
	},
};
let tray = // tray info 
{
	trayed: false,
	ui:
	{
		main_box: null,
		text: null,
		play_button: null,
		next_button: null,
		prev_button: null
	}
};

let controller = // cmus controller object
{
	cmus: { state: "off", title: "title", album: "album", artist: "artist" }, // current status
};

/*************************************
 * Returns formatted string with info
 *************************************/
function formatted(str)
{
	return str.replace("%a%", _status.artist).replace("%t%", _status.title).replace("%al%", _status.album);
}

/*****************************
 * Updates player status info
 *****************************/
function _updateInfo()
{
	const std = GLib.spawn_command_line_sync("cmus-remote -Q");
	if (std[2].toString() != "")
	{
		_status = { state: "off", title: "title", album: "album", artist: "artist" };
		status_label.text = "cmus is off";
		status_icon.icon_name = "media-playback-stop-symbolic";
	}
	else
	{	// resolve recieved data
		const stdout = std[1].toString().replace(/\'/g, "\\\`");

		// get cmus status
		_status.state = GLib.spawn_command_line_sync("sh -c 'echo \"" + stdout + "\" | grep \"status \" | sed \"s/status\\s*//g\"'")[1].toString().replace("\n", "");

		if (_status.state == "stopped")
		{
			_status = { state: "stopped", title: "title", album: "album", artist: "artist" };
			status_icon.icon_name = "media-playback-stop-symbolic";
			status_label.text = "not playing";
		}
		else
		{	// get track data
			const title = GLib.spawn_command_line_sync("sh -c 'echo \"" + stdout + "\" | grep \"tag title \" | sed \"s/tag\\stitle\\s*//g\"'")[1].toString().replace("\n", "");
			const album = GLib.spawn_command_line_sync("sh -c 'echo \"" + stdout + "\" | grep \"tag album \" | sed \"s/tag\\salbum\\s*//g\"'")[1].toString().replace("\n", "");
			const artist = GLib.spawn_command_line_sync("sh -c 'echo \"" + stdout + "\" | grep \"tag artist \" | sed \"s/tag\\sartist\\s*//g\"'")[1].toString().replace("\n", "");
			
			if ((_status.title != title) || (_status.album != album) || (_status.artist != artist))
			{

				_status.title = title;
				_status.album = album;
				_status.artist = artist;

				status_label.text = formatted(tray_format);

				_showPopup();
			}
			
			if (_status.state == "paused") 
			{
				status_icon.icon_name = "media-playback-pause-symbolic";
			}
			if (_status.state == "playing") 
			{
				status_icon.icon_name = "media-playback-start-symbolic";
			}
		}
	}
	
	Mainloop.timeout_add(250, _updateInfo);
}

/********************
 * Removes the popup
 ********************/
function _hidePopup(index) 
{
	if ((text != null) && (index == hideIndex))
	{
		Main.uiGroup.remove_actor(text);
		text = null;
	}
}

/**************
 * Shows popup
 **************/
function _showPopup() 
{
	_hidePopup(hideIndex);
	if (!text) {
		text = new St.Label({ style_class: 'popup-label', text: formatted(notify_format) });
		Main.uiGroup.add_actor(text);
	}
	text.opacity = 255;

	let monitor = Main.layoutManager.primaryMonitor;

	//text.set_position(monitor.x + Math.floor(monitor.width / 2 - text.width / 2),
	//		monitor.y + Math.floor(monitor.height / 2 - text.height / 2));
	let posX = 0;
	if (hPos == 0) posX = 10;
	if (hPos == 1) posX = monitor.x + Math.floor(monitor.width / 2 - text.width / 2);
	if (hPos == 2) posX = monitor.x + monitor.width - text.width - 10;

	let posY = 0;
	if (vPos == 0) posY = 10;
	if (vPos == 1) posY = monitor.y + Math.floor(monitor.height / 2 - text.height / 2);
	if (vPos == 2) posY = monitor.y + Math.floor(monitor.height - text.height) - 10;

	text.set_position(posX, posY);

	hideIndex++;

	const current = hideIndex;

	Mainloop.timeout_add_seconds(fadeStartTime, () =>
	{
		Tweener.addTween(text,
			{ opacity: 0,
			time: fadeDuration,
			transition: 'easeOutQuad',
			onComplete: () => { _hidePopup(current); } });
	});
}

/*****************
 * Initialization
 *****************/
function init() 
{
	// set up tray
	main_box = new St.BoxLayout();
	
	// main button
	button = new St.Bin({ style_class: 'panel-button',
				reactive: true,
				can_focus: true,
				x_fill: true,
				y_fill: false,
				track_hover: true });
	let box = new St.BoxLayout();

	status_label = new St.Label({ style_class: 'tray-label', text: formatted(tray_format) });
	status_icon = new St.Icon({ icon_name: 'media-playback-pause-symbolic',
				style_class: 'system-status-icon' });

	box.add_child(status_icon);
	box.add_child(status_label);

	button.set_child(box);
	button.connect('button-press-event', () => 
	{ 
		switch (_status.state)
		{
			case "playing":
				GLib.spawn_command_line_sync("cmus-remote -u");
				break;
			case "paused":
				GLib.spawn_command_line_sync("cmus-remote -p");
				break;
			case "off":
				const terminal = GLib.spawn_command_line_sync("sh -c \"gsettings get org.gnome.desktop.default-applications.terminal exec | sed \\\"s/'//g\\\"\"")[1].toString().replace("\n", ""); 
				const exec = GLib.spawn_command_line_sync("sh -c \"gsettings get org.gnome.desktop.default-applications.terminal exec-arg | sed \\\"s/'//g\\\"\"")[1].toString().replace("\n", "");
				GLib.spawn_command_line_sync(terminal + " " + exec + " cmus");
				break;
		}
	});

	// "next" button
	next_button = new St.Bin({ style_class: 'panel-button',
				reactive: true,
				can_focus: true,
				x_fill: true,
				y_fill: false,
				track_hover: true });
	let next_icon = new St.Icon({ icon_name: 'media-skip-forward-symbolic',
					style_class: 'system-status-icon' });

	next_button.set_child(next_icon);
	next_button.connect("button-press-event", () =>
	{
		GLib.spawn_command_line_sync("cmus-remote -n");
	});
	
	// "previous" button
	prev_button = new St.Bin({ style_class: 'panel-button',
				reactive: true,
				can_focus: true,
				x_fill: true,
				y_fill: false,
				track_hover: true });
	let prev_icon = new St.Icon({ icon_name: 'media-skip-forward-symbolic-rtl',
					style_class: 'system-status-icon' });

	prev_button.set_child(prev_icon);
	prev_button.connect("button-press-event", () =>
	{
		GLib.spawn_command_line_sync("cmus-remote -r");
	});

	main_box.add_child(prev_button);
	main_box.add_child(button);
	main_box.add_child(next_button);

	_updateInfo();
}

function _showTrayMessage() 
{
	if (!trayed)
	{
		trayed = true;
		Main.panel._rightBox.insert_child_at_index(main_box, 0);
	}
}

function _hideTrayMessage() 
{
	if (trayed) 
	{
		trayed = false;
		Main.panel._rightBox.remove_child(main_box);
	}
}

function enable()
{
	_showTrayMessage();

	global.display.connect("accelerator-activated", (display, action, deviceId, timestamp) =>
	{
		if (action == playCode)
		{
			switch (_status.state)
			{
				case "playing":
					GLib.spawn_command_line_sync("cmus-remote -u");
					break;
				case "paused":
					GLib.spawn_command_line_sync("cmus-remote -p");
					break;
				case "off":
					const terminal = GLib.spawn_command_line_sync("sh -c \"gsettings get org.gnome.desktop.default-applications.terminal exec | sed \\\"s/'//g\\\"\"")[1].toString().replace("\n", ""); 
					const exec = GLib.spawn_command_line_sync("sh -c \"gsettings get org.gnome.desktop.default-applications.terminal exec-arg | sed \\\"s/'//g\\\"\"")[1].toString().replace("\n", "");
					GLib.spawn_command_line_sync(terminal + " " + exec + " cmus");
					break;
			}
		}
		if (action == prevCode) GLib.spawn_command_line_sync("cmus-remote -r");
		if (action == nextCode) GLib.spawn_command_line_sync("cmus-remote -n");
	});
	
	let playAction = global.display.grab_accelerator(PLAY_BUTTON);
	let prevAction = global.display.grab_accelerator(PREV_BUTTON);
	let nextAction = global.display.grab_accelerator(NEXT_BUTTON);

	if (playAction == Meta.KeyBindingAction.NONE)
	{
		log("cmus-status: Unable to bind play!");
	}
	else
	{
		let playName = Meta.external_binding_name_for_action(playAction);

		Main.wm.allowKeybinding(playName, Shell.ActionMode.ALL);

		playCode = playName.substring(playName.lastIndexOf("-") + 1);
		log("cmus-status: Bound play: name: " + playName + "; №" + playCode);
	}
	
	if (prevAction == Meta.KeyBindingAction.NONE)
	{
		log("cmus-status: Unable to bind prev!");
	}
	else
	{
		let prevName = Meta.external_binding_name_for_action(prevAction);

		Main.wm.allowKeybinding(prevName, Shell.ActionMode.ALL);

		prevCode = prevName.substring(prevName.lastIndexOf("-") + 1);
		log("cmus-status: Bound prev: name: " + prevName + "; №" + prevCode);
	}

	if (nextAction == Meta.KeyBindingAction.NONE)
	{
		log("cmus-status: Unable to bind next!");
	}
	else
	{
		let nextName = Meta.external_binding_name_for_action(nextAction);

		Main.wm.allowKeybinding(nextName, Shell.ActionMode.ALL);

		nextCode = nextName.substring(nextName.lastIndexOf("-") + 1);
		log("cmus-status: Bound next: name: " + nextName + "; №" + nextCode);
	}
}

function disable()
{
	_hideTrayMessage();
}
