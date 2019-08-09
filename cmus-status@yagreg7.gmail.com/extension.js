// imports
const Clutter	= imports.gi.Clutter;
const Gio 	= imports.gi.Gio;
const GLib 	= imports.gi.GLib;
const Lang 	= imports.lang;
const Main 	= imports.ui.main;
const MainLoop 	= imports.mainloop;
const Me	= imports.misc.extensionUtils.getCurrentExtension();
const Meta	= imports.gi.Meta;
const PanelMenu	= imports.ui.panelMenu;
const PopupMenu	= imports.ui.popupMenu;
const Shell 	= imports.gi.Shell;
const Slider	= imports.ui.slider;
const St	= imports.gi.St;
const Tweener	= imports.ui.tweener;

const Shared	= Me.imports.shared;

let gsettings = null;

// extension settings
let settings =
{
	updated: false,
	// string formats
	// %a% - atrist
	// %t% - title
	// %al% - album
	trayFormat: "%a% - %t%",
	notifyFormat: "%a% - %t% (%al%)",

	updateIntervalMs: 250,

	simpleTray: true,

	// key bindings
	bindings:
	{
		enabled: true,
		play: "<alt>c",
		back: "<alt>x",
		next: "<alt>v"
	},

	notification:
	{
		fadeStartTime: 2, fadeDuration: 5, // animation timers
		vPos: 2, hPos: 2, // 1 = left/top; 2 = center; 3 = right / bottom
		enabled: true
	},

	// formats the string
	format: function(str)
	{
		return str.replace("%a%", cmus.track.artist).replace("%t%", cmus.track.title).replace("%al%", cmus.track.album);
	}
};

// key manager
let keys =
{
	bindings: [],
	bound: false,

	connectId: null, // to disconnect listener later

	init: function()
	{	// initialize listener
		this.connectId = global.display.connect("accelerator-activated", (display, action, deviceId, timestamp) =>
		{
			for (let i = 0; i < this.bindings.length; i++)
			{
				if (this.bindings[i].code == action)
				{
					this.bindings[i].callback();
					break;
				}
			}
		});
	},

	addBinding: function(binding, callback)
	{	// create binding
		const keyAction = global.display.grab_accelerator(binding);
		if (keyAction == Meta.KeyBindingAction.NONE)
		{
			log("cmus-status: Unable to bind " + binding);
		}
		else
		{
			const keyName = Meta.external_binding_name_for_action(keyAction);

			Main.wm.allowKeybinding(keyName, Shell.ActionMode.ALL);

			const keyCode = keyName.substring(keyName.lastIndexOf("-") + 1);

			this.bindings[this.bindings.length] = 
			{
				binding: binding,
				action: keyAction,
				name: keyName,
				code: keyCode,
				callback: callback
			};

			log("cmus-status: Bound " + binding + ": name : " + keyName + "; №" + keyCode);
		}
	},

	detach: function()
	{	// remove all keybindings and a listener
		for (let i = 0; i < this.bindings.length; i++)
		{
			global.display.ungrab_accelerator(this.bindings[i].action);
			Main.wm.allowKeybinding(this.bindings[i].name, Shell.ActionMode.NONE);
			log("cmus-status: Unbound " + this.bindings[i].binding + ": name: " + this.bindings[i].name + "; №" + this.bindings[i].code);
		}

		this.bindings = [];

		global.display.disconnect(this.connectId);
	},

	// converts bind ID from settings to accelerator
	bindIdToAccel: function(bindId)
	{
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
};

// notification object
let notification =
{
	offset: 10, // notification offset
	hideIndex: 0, // workaround to not remove notification from the screen too early when changing tracks fast
	actor: null, // notification
	notification_text: "TEST",
	
	show: function()
	{	// show notification
		this.hide(this.hideIndex);

		if (!this.actor)
		{
			this.actor = new St.Label({ style_class: "notification-label", text: this.notification_text });
			Main.uiGroup.add_actor(this.actor);
		}
		this.actor.opacity = 255;

		let monitor = Main.layoutManager.primaryMonitor;

		// calculate notification position
		let posX = 0;
		if (settings.notification.hPos == 0) posX = this.offset;
		if (settings.notification.hPos == 1) posX = monitor.x + Math.floor(monitor.width / 2 - this.actor.width / 2);
		if (settings.notification.hPos == 2) posX = monitor.x + monitor.width - this.actor.width - this.offset;

		let posY = 0;
		if (settings.notification.vPos == 0) posY = this.offset;
		if (settings.notification.vPos == 1) posY = monitor.y + Math.floor(monitor.height / 2 - this.actor.height / 2);
		if (settings.notification.vPos == 2) posY = monitor.y + monitor.height - this.actor.height - this.offset;

		this.actor.set_position(posX, posY);

		this.hideIndex++;

		const current = this.hideIndex;

		// set hide timeout
		MainLoop.timeout_add_seconds(settings.notification.fadeStartTime, () =>
		{
			Tweener.addTween(this.actor, 
						{ 
							opacity: 0, 
							time: settings.notification.fadeDuration, 
							transition: "easeOutQuad",
							onComplete: () => { this.hide(current); }
						});
		});
	},

	hide: function(index)
	{	// hide notification
		if ((this.actor != null) && (index == this.hideIndex))
		{
			Main.uiGroup.remove_actor(this.actor);
			this.actor = null;
		}
	},

	setText: function(text)
	{
		this.notification_text = text;
	}
};

// tray management
const trayItem = new Lang.Class({
	Name: "trayItem",
	Extends: PanelMenu.Button,

	main_box: null, // container for all tray ui
	prev_button: null, button: null, next_button: null, // playback buttons
	status_label: null, status_icon: null, // middle button contents
	popup_status_icon: null, 
	trayed: false, // is system stray ui showed?
	caption: "tray label", // label caption
	time_label: null, // popup labels that display track current time/duration
	progress_bar: null, // bar that shows song progress

	_init: function()
	{	// tray initialization
		this.parent(0.5, "cmus-status", false);

		if (settings.simpleTray) this.initSimple();
		else this.initWPopup();
	},

	initWPopup: function()
	{
		// construct tray ui
		this.main_box = new St.BoxLayout();
		
		this.button = new St.Bin({ style_class: "panel-button",
						reactive: true,
						can_focus: true,
						x_fill: true,
						y_fill: false,
						track_hover: true });

		let box = new St.BoxLayout();

		this.status_label = new St.Label({ style_class: "tray-label", text: this.caption });
		this.status_icon = new St.Icon({ icon_name: "media-playback-pause-symbolic",
						style_class: "system-status-icon" });

		box.add_child(this.status_icon);
		box.add_child(this.status_label);

		this.button.set_child(box);

		this.main_box.add_child(this.button);

		this.actor.add_child(this.main_box);

		// create popup
		let progressItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });

		let progressBox = new St.Bin({ style_class: "popup-time-bar", reactive: false, can_focus: false, x_fill: true, y_fill: false, track_hover: false });

		this.progress_bar = new Slider.Slider(0.5);
		this.progress_bar.connect("value-changed", () => { cmus.setPosition(this.progress_bar.value); });
		progressBox.set_child(this.progress_bar.actor);
		progressItem.actor = progressBox;

		let timeItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });

		this.time_label = new St.Label({ text: "time / duration", style_class: "popup-time-label" });

		timeItem.actor = this.time_label;

		let controlItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });

		let controlButtonPlay = new St.Button({ style_class: "system-menu-action",
							reactive: true,
							can_focus: true,
							track_hover: true });
		this.popup_status_icon = new St.Icon({ icon_name: "media-playback-pause-symbolic" });
		let controlButtonPrev = new St.Button({ style_class: "system-menu-action",
							reactive: true,
							can_focus: true,
							track_hover: true });
		let prevIcon = new St.Icon({ icon_name: "media-skip-forward-symbolic-rtl" });
		let controlButtonNext = new St.Button({	style_class: "system-menu-action", 
							reactive: true,
							can_focus: true,
							track_hover: true });
		let nextIcon = new St.Icon({ icon_name: "media-skip-forward-symbolic" });

		controlButtonPrev.set_child(prevIcon);
		controlButtonPlay.set_child(this.popup_status_icon);
		controlButtonNext.set_child(nextIcon);

		controlButtonPrev.connect("clicked", () => { cmus.back(); });
		controlButtonPlay.connect("clicked", () => { cmus.play_action(); });
		controlButtonNext.connect("clicked", () => { cmus.next(); });

		controlItem.actor.add_actor(controlButtonPrev);
		controlItem.actor.add_actor(controlButtonPlay);
		controlItem.actor.add_actor(controlButtonNext);

		this.menu.addMenuItem(progressItem);
		this.menu.addMenuItem(timeItem);
		this.menu.addMenuItem(controlItem);
	},
	
	initSimple: function()
	{
		// construct tray ui
		this.main_box = new St.BoxLayout();

		this.button = new St.Bin({ style_class: "panel-button",
						reactive: true,
						can_focus: true,
						x_fill: true,
						y_fill: false,
						track_hover: true });

		let box = new St.BoxLayout();

		this.status_label = new St.Label({ style_class: "tray-label", text: this.caption });
		this.status_icon = new St.Icon({ icon_name: "media-playback-pause-symbolic",
						style_class: "system-status-icon" });

		box.add_child(this.status_icon);
		box.add_child(this.status_label);

		this.button.set_child(box);

		this.button.connect("button-press-event", () =>
		{
			cmus.play_action();
		});

		this.prev_button = new St.Bin({ style_class: "panel-button",
						reactive: true,
						can_focus: true,
						x_fill: true,
						y_fill: false,
						track_hover: true });
		let prev_icon = new St.Icon({ icon_name: "media-skip-forward-symbolic-rtl",
						style_class: "system-status-icon" });

		this.prev_button.set_child(prev_icon);
		this.prev_button.connect("button-press-event", () =>
		{
			cmus.back();
		});

		this.next_button = new St.Bin({ style_class: "panel-button",
						reactive: true,
						can_focus: true,
						x_fill: true,
						y_fill: false,
						track_hover: true });
		let next_icon = new St.Icon({ icon_name: "media-skip-forward-symbolic",
						style_class: "system-status-icon" });

		this.next_button.set_child(next_icon);
		this.next_button.connect("button-press-event", () =>
		{
			cmus.next();
		});

		this.main_box.add_child(this.prev_button);
		this.main_box.add_child(this.button);
		this.main_box.add_child(this.next_button);

		this.actor.add_child(this.main_box);
	},

	show: function()
	{	// add to tray
		if (!this.trayed)
		{
			this.trayed = true;
			Main.panel.addToStatusArea("cmus-status", this, 0, "right");
		}
	},

	hide: function()
	{	// remove from tray
		if (this.trayed)
		{
			this.trayed = false;
			this.destroy();
		}
	}, 

	setCaption: function(newCaption)
	{
		this.caption = newCaption;

		if (this.status_label) this.status_label.text = newCaption;
	},

	updateStatus: function(newStatus)
	{	// updates middle button icon accordingly
		if (this.status_icon) switch (newStatus)
		{
			case "off": case "stopped":
				this.status_icon.icon_name = "media-playback-stop-symbolic";
				break;
			case "paused":
				this.status_icon.icon_name = "media-playback-pause-symbolic";
				break;
			case "playing":
				this.status_icon.icon_name = "media-playback-start-symbolic";
				break;
		}
		
		if (this.popup_status_icon) switch (newStatus)
		{
			case "off": case "stopped":
				this.popup_status_icon.icon_name = "media-playback-stop-symbolic";
				break;
			case "playing":
				this.popup_status_icon.icon_name = "media-playback-pause-symbolic";
				break;
			case "paused":
				this.popup_status_icon.icon_name = "media-playback-start-symbolic";
				break;
		}
	},

	// updates time
	setTime: function(time, duration)
	{
		if (duration == 0)
		{
			if (this.time_label) this.time_label.set_text("-:-- / -:--");
			if (this.progress_bar) this.progress_bar.setValue(0);
		}
		else
		{
			const t_sec = time % 60;
			const t_min = (time - t_sec) / 60;
			const d_sec = duration % 60;
			const d_min = (duration - d_sec) / 60;
			if (this.time_label) this.time_label.set_text(t_min + ":" + t_sec + " / " + d_min + ":" + d_sec);
			if (this.progress_bar) this.progress_bar.setValue(time / duration);
		}
	}
});
let tray = null;

// cmus controller
let cmus =
{
	state: "off",
	track: 
	{ 
		title: "title", 
		album: "album", 
		artist: "artist", 
		time: 0, 
		duration: 0 
	},
	default_track: 
	{ 
		title: "title", 
		album: "album", 
		artist: "artist", 
		time: 0, 
		duration: 0 
	},
	updated: false, // true if track info changed

	updateStatus: function()
	{	// recieves info from cmus-remote
		const std = GLib.spawn_command_line_sync("cmus-remote -Q");
		if (std[2].toString() != "") // check if theere are any errors. If cmus is off, stderr is also not empty
		{
			this.state = "off";
			this.track = this.default_track;
		}
		else
		{
			// resolve recieved data
			const stdout = std[1].toString().replace(/\'/g, "\\\`"); // replace ' quotes with ` to avoid errors while parsing commands later

			// get cmus status
			this.state = GLib.spawn_command_line_sync("sh -c 'echo \"" + stdout + "\" | grep \"status \" | sed \"s/status\\s*//g\"'")[1].toString().replace("\n", "");

			if (this.state == "stopped")
			{
				this.track = this.default_track;
			}
			else
			{
				// get track info
				const title = GLib.spawn_command_line_sync("sh -c 'echo \"" + stdout + "\" | grep \"tag title \" | sed \"s/tag\\stitle\\s*//g\"'")[1].toString().replace("\n", "");
				const album = GLib.spawn_command_line_sync("sh -c 'echo \"" + stdout + "\" | grep \"tag album \" | sed \"s/tag\\salbum\\s*//g\"'")[1].toString().replace("\n", "");
				const artist = GLib.spawn_command_line_sync("sh -c 'echo \"" + stdout + "\" | grep \"tag artist \" | sed \"s/tag\\sartist\\s*//g\"'")[1].toString().replace("\n", "");

				const duration = GLib.spawn_command_line_sync("sh -c 'echo \"" + stdout + "\" | grep \"duration \" | sed \"s/duration\\s*//g\"'")[1].toString().replace("\n", "");
				const time = GLib.spawn_command_line_sync("sh -c 'echo \"" + stdout + "\" | grep \"position \" | sed \"s/position\\s*//g\"'")[1].toString().replace("\n", "");

				if ((this.track.title != title) || (this.track.album != album) || (this.track.artist != artist))
				{
					this.track.title = title;
					this.track.album = album;
					this.track.artist = artist;

					this.updated = true;
				}

				// some parameters do not require showing notification
				if ((this.track.time != time) || (this.track.duration != duration))
				{
					this.track.time = time;
					this.track.duration = duration;
				}
			}
		}
	},

	play: function()
	{
		GLib.spawn_command_line_sync("cmus-remote -p");
	},

	pause: function()
	{
		GLib.spawn_command_line_sync("cmus-remote -u");
	},

	launch: function()
	{
		const terminal = GLib.spawn_command_line_sync("sh -c \"gsettings get org.gnome.desktop.default-applications.terminal exec | sed \\\"s/'//g\\\"\"")[1].toString().replace("/n", "");
		const arg = GLib.spawn_command_line_sync("sh -c \"gsettings get org.gnome.desktop.default-applications.terminal exec-arg | sed \\\"s/'//g\\\"\"")[1].toString().replace("/n", "");
		if (terminal && arg) GLib.spawn_command_line_sync(terminal + " " + arg + " cmus");
	},

	back: function()
	{
		GLib.spawn_command_line_sync("cmus-remote -r");
	},

	next: function()
	{
		GLib.spawn_command_line_sync("cmus-remote -n");
	},

	play_action: function()
	{	// we want to resume playing if paused, pause if playing, or turn on cmus if it is off
		switch (this.state)
		{
			case "off":
				this.launch();
				break;
			case "paused":
				this.play();
				break;
			case "playing":
				this.pause();
				break;
		}
	},

	setPosition: function(position)
	{
		const positionSec = Math.floor(this.track.duration * position);
		GLib.spawn_command_line_sync("cmus-remote -k " + positionSec);
	}
};

let enabled = false; // false to stop updating the status

// re-load settings from gsettings
function updateSettings()
{
	settings.updateIntervalMs = gsettings.get_int(Shared.updateIntervalKey);

	settings.notification.enabled = gsettings.get_boolean(Shared.enableNotKey);
	settings.notification.hPos = gsettings.get_int(Shared.notPosXKey);
	settings.notification.vPos = gsettings.get_int(Shared.notPosYKey);

	settings.notification.fadeStartTime = gsettings.get_int(Shared.notFadeStartKey);
	settings.notification.fadeDuration = gsettings.get_int(Shared.notFadeDurationKey);

	settings.trayFormat = gsettings.get_string(Shared.trayFormatKey);
	settings.notifyFormat = gsettings.get_string(Shared.notFormatKey);

	const newBindsEnabled = gsettings.get_boolean(Shared.enableBindsKey);
	if (newBindsEnabled != settings.bindings.enabled)
	{
		if (newBindsEnabled)
		{
			if (!keys.bound)
			{
				keys.init();
				keys.addBinding(settings.bindings.play, () => { cmus.play_action(); });
				keys.addBinding(settings.bindings.back, () => { cmus.back(); });
				keys.addBinding(settings.bindings.next, () => { cmus.next(); });
				keys.bound = true;
			}
		}
		else
		{

			if (keys.bound) 
			{
				keys.detach();
				keys.bound = false;
			}
		}

		settings.bindings.enabled = newBindsEnabled;
	}

	const newPlayBind = keys.bindIdToAccel(gsettings.get_string(Shared.playBindKey));
	const newPrevBind = keys.bindIdToAccel(gsettings.get_string(Shared.prevBindKey));
	const newNextBind = keys.bindIdToAccel(gsettings.get_string(Shared.nextBindKey));

	log("cmus-status: New binds play/prev/next - " + newPlayBind + "/" + newPrevBind + "/" + newNextBind);

	if ((settings.bindings.play != newPlayBind) || (settings.bindings.prev != newPrevBind) || (settings.bindings.next != newNextBind))
	{
		settings.bindings.play = newPlayBind;
		settings.bindings.back = newPrevBind;
		settings.bindings.next = newNextBind;

		keys.detach();
		keys.bound = false;
		keys.init();
		keys.addBinding(settings.bindings.play, () => { cmus.play_action(); });
		keys.addBinding(settings.bindings.back, () => { cmus.back(); });
		keys.addBinding(settings.bindings.next, () => { cmus.next(); });
		keys.bound = true;
	}

	const newSimpleTray = gsettings.get_boolean(Shared.simpleTrayKey);
	if (newSimpleTray != settings.simpleTray)
	{
		settings.simpleTray = newSimpleTray;
		if (tray != null)
		{
			if (tray.trayed) 
			{
				tray.hide();
				tray = new trayItem;
				tray.show();
			}
		}
	}

	gsettings.set_boolean(Shared.needsUpdateKey, false);
}

// status update function
function updateStatus()
{
	cmus.updateStatus();

	if (gsettings.get_boolean(Shared.needsUpdateKey)) updateSettings();

	if (cmus.updated && settings.notification.enabled)
	{
		notification.setText(settings.format(settings.notifyFormat));
		notification.show();
		cmus.updated = false;
	}

	tray.updateStatus(cmus.state);
	switch (cmus.state)
	{
		case "off":
			tray.setCaption("cmus is off");
			tray.setTime(0, 0);
			break;
		case "stopped":
			tray.setCaption("not playing");
			tray.setTime(0, 0);
			break;
		case "paused": case "playing":
			tray.setCaption(settings.format(settings.trayFormat));
			tray.setTime(cmus.track.time, cmus.track.duration);
			break;
	}


	if (settings.updated) { notification.show(); settings.updated = false; }

	if (enabled) MainLoop.timeout_add(settings.updateIntervalMs, updateStatus);
}

// extension functions
function init()
{
	gsettings = Shared.getSettings(Shared.settingsSchema);
}

function enable()
{
	tray = new trayItem;
	tray.show();

	enabled = true;
	updateSettings();	// updateStatus() calls updateSettings() only if settings-updated is true
				// to be sure settings are loaded, updateSettings() must be called manually
	updateStatus();
}

function disable()
{
	tray.hide();

	notification.hide(notification.hideIndex);

	if (keys.bound)
	{
		keys.detach();
		keys.bound = false;
	}

	enabled = false;
}
