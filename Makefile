# carefully copied from Arc menu Makefile
ifeq ($(strip $(DESTDIR)),)
	INSTALLBASE := $(HOME)/.local/share/gnome-shell/extensions
else
	INSTALLBASE := $(DESTDIR)/usr/share/gnome-shell/extensions
endif

INSTALLNAME := cmus-status@yagreg7.gmail.com

install: remove
	glib-compile-schemas $(INSTALLNAME)/schemas/
	cp -R $(INSTALLNAME) $(INSTALLBASE)/
	-gnome-extensions enable $(INSTALLNAME)
zip:
	glib-compile-schemas $(INSTALLNAME)/schemas
	cd $(INSTALLNAME) && zip -r gnome-cmus-status.zip ./ -x *.sw* -x *old-extension.js -x *~

remove:
	-rm -rf $(INSTALLBASE)/$(INSTALLNAME)
