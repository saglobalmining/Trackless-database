window.callbackHandler = {};
var VirtualEarthController = Class.create({
    initialize: function(options) {
        this.container = $(options.container);
        this.container.vec = this;

        this.form = options.form;
        this.form.wrapper = $(this.form.wrapper);
        this.form.container = $(this.form.container);

        this.defaultZoom = parseInt(options.config.zoomlevel);
        this.mapStyle = this.toMapStyle(options.config.mapstyle);
        this.staticmap = options.staticmap == "true";
        this.distanceUnit = (options.distanceUnit ? options.distanceUnit : "mi");
        this.latLong = (options.latitude && options.longitude ? new Microsoft.Maps.Location(Number(options
            .latitude), Number(options.longitude)) : null);
        this.searchaddress = options.searchaddress; /* if this is set, it is used for routing instead of latLong */
        this.centerLatLong = (options.centerlatitude && options.centerlongitude ? new Microsoft
            .Maps.Location(Number(options.centerlatitude), Number(options.centerlongitude)) : null
        );

        this.pushpinOffsetX = (options.pushpinOffsetX ? parseInt(options.pushpinOffsetX) : 14);
        this.pushpinOffsetY = (options.pushpinOffsetY ? parseInt(options.pushpinOffsetY) : 35);
        this.pushpinWidth = (options.pushpinWidth ? parseInt(options.pushpinWidth) : 48);
        this.pushpinHeight = (options.pushpinHeight ? parseInt(options.pushpinHeight) : 48);
        this.imageryCulture = (options.imageryCulture ? options.imageryCulture : "en-US");
        this.routeCulture = (options.routeCulture ? options.routeCulture : "en-US");
        this.doAutoCenter = options.config.autoCenter == "true";
        this.labeloverlay = Number((options.config.labeloverlay ? options.config.labeloverlay : Microsoft
            .Maps.LabelOverlay.visible));
        this.contactData = options.contactData;
        this.isConfigMode = options.config.configMode == "true";
        this.isRouteplanner = options.config.routeplanner == "true";
        this.commonWidget = options.commonWidget || {
            createUrl: Prototype.K
        };
        this.useAdvancedAddress = (options.useAdvancedAddress ? options.useAdvancedAddress === "true" : false);
        this.flyoutDuration = 0.75;

        this.apikey = (options.bingMapsKey ? options.bingMapsKey : "");
        this.RESTLocationsBaseUrl = (options.RESTLocationsBaseUrl ? options.RESTLocationsBaseUrl : "")
            .replace(/^(https\:|http\:)/, "");
        this.RESTRoutesBaseUrl = (options.RESTRoutesBaseUrl ? options.RESTRoutesBaseUrl : "").replace(/^(https\:|http\:)/, "");
        this.RESTImageryBaseUrl = (options.RESTImageryBaseUrl ? options.RESTImageryBaseUrl : "")
            .replace(/^(https\:|http\:)/, "");
		this.searchConfidenceLevel = options.searchConfidenceLevel || "High";

        if (this.doAutoCenter || this.centerLatLong == null) {
            this.centerLatLong = this.latLong;
        }
        var mapOptions = {
            "enableSearchLogo": false,
            "enableClickableLogo": false,
            "disableKeyboardInput": true,
            "disableBirdseye": true,
            "credentials": this.apikey
        };

        var viewOptions = {
            "center": this.centerLatLong,
            "zoom": this.defaultZoom,
            "mapTypeId": this.mapStyle,
            "labelOverlay": this.labeloverlay
        }

        if (jQuery.browser.msie && jQuery.browser.version == "6.0") {
            viewOptions.width = options.config.width || 640;
            viewOptions.height = options.config.height || 480;
        };

        this.map = new Microsoft.Maps.Map(document.getElementById(this.container.identify()), mapOptions);
        /*the latest map on page will be used for getting sessionids*/
        window.mapServiceCredentialMap = this.map;
        this.map.setView(viewOptions);
        if (this.latLong) {
            this.setPushpin({
                latLong: this.latLong,
                searchaddress: this.searchaddress
            });
        }

        // attach events
        if (this.isConfigMode) {
            Microsoft.Maps.Events.addHandler(this.map, "click", function(ev) {
                if (true || ev.shiftKey) {
                    this.setPushpin({
                        latLong: ev.location /* no searchaddress here! */
                    });
                }
            }.bind(this));
        }

        // load additional modules 	
        Microsoft.Maps.loadModule('Microsoft.Maps.Directions', {
            callback: this.directionsModuleLoaded.bind(this)
        });

    },

    verifyStaticMap: function(latLong, zoomlevel, maptype) {
        if (maptype == Microsoft.Maps.MapTypeId.road || !this.staticmap) {
            return;
        }
        this.MetadataOptions = {
            "latLong": latLong,
            "zoomlevel": zoomlevel
        };
        window.mapServiceCredentialMap.getCredentials(this.makeImageMetadataRequest.bind(this));
    },

    toMapStyle: function(sSytle) {
        if (sSytle == Microsoft.Maps.MapTypeId.road) {
            return Microsoft.Maps.MapTypeId.road;
        }
        if (sSytle == Microsoft.Maps.MapTypeId.aerial) {
            return Microsoft.Maps.MapTypeId.aerial;
        }
        return Microsoft.Maps.MapTypeId.auto;
    },

    parseAddress: function(address) {
        return unescape(address.replace(/&lt;br&gt;/g, '<br>'));
    },

    setPushpin: function(data) {
        this.searchaddress = data.searchaddress || null;

        if (this.shape) {

            this.shape.setLocation(data.latLong);
            this.shape.setOptions({
                "anchor": new Microsoft.Maps.Point(this.pushpinOffsetX, this.pushpinOffsetY)
            });

            this.infobox.setLocation(data.latLong);
            this.infobox.setOptions({
                "offset": new Microsoft.Maps.Point(30, 15)
            });

            if (!this.map.getBounds().contains(data.latLong)) {
                this.map.setView({
                    "center": data.latLong
                });
            }
            return;
        }

        var pushPinOptions = {
            "icon": this.getResourceUrl('pin.png'),
            "width": this.pushpinWidth,
            "height": this.pushpinHeight,
            "anchor": new Microsoft.Maps.Point(this.pushpinOffsetX, this.pushpinOffsetY)
        };

        var contactData = new Element('div', {
            'class': 'mapServicesContactData'
        });

        if (this.useAdvancedAddress) {
            if (this.contactData.street || this.contactData.buildingnumber) {
                contactData.insert(this.contactData.street + " " + this.contactData.buildingnumber)
                    .insert(new Element('br'));
            }

            if (this.contactData.zip || this.contactData.city) {
                contactData.insert(this.contactData.zip + " " + this.contactData.city)
                    .insert(new Element('br'));
            }

            if (this.contactData.phoneBusiness) {
                contactData.insert(window.mapServiceTranslator.telefon + " " + this.contactData
                    .phoneBusiness)
                    .insert(new Element('br'));
            }

            if (this.contactData.phoneFax) {
                contactData.insert(window.mapServiceTranslator.fax + " " + this.contactData.phoneFax)
                    .insert(new Element('br'));
            }

            if (this.contactData.email) {
                contactData.insert(this.contactData.email)
                    .insert(new Element('br'));
            }
        } else if (this.contactData.description) {
            contactData.insert(this.parseAddress(this.contactData.description))
                .insert(new Element('br'));
        }

        if (this.isRouteplanner && !this.isConfigMode) {
            contactData.insert(new Element('br'))
                .insert(new Element('a', {
                    onclick: '$("' + this.container.identify() + '").vec.showRoutingForm(\'to\');return false;',
                    href: '#'
                }).update(window.mapServiceTranslator.routing));
        }

        var infoBoxContainer = new Element('div', {
            'class': 'mapServicesInfoBoxContainer'
        });
        infoBoxContainer
            .insert(new Element('div', {
                'class': 'title'
            }).insert(this.contactData.shortname))
            .insert(contactData);

        /*be aware of : setting a title currently overwrites htmlContent*/
        var infoBoxOptions = {
            "visible": false,
            "showPointer": false,
            "showCloseButton": false,
            "htmlContent": new Element('div').update(infoBoxContainer).innerHTML,
            "offset": new Microsoft.Maps.Point(30, 15)
        };

        this.shape = new Microsoft.Maps.Pushpin(data.latLong, pushPinOptions);
        this.infobox = new Microsoft.Maps.Infobox(data.latLong, infoBoxOptions);

        if (!this.isConfigMode) {
            Microsoft.Maps.Events.addHandler(this.infobox, 'mouseleave', this.onInfoboxLeave.bind(this));
            Microsoft.Maps.Events.addHandler(this.infobox, 'mouseenter', this.onInfoboxEnter.bind(this));
            Microsoft.Maps.Events.addHandler(this.shape, 'mouseover', this.onPushpinEnter.bind(this));
            Microsoft.Maps.Events.addHandler(this.shape, 'mouseout', this.onPushpinLeave.bind(this));
            Microsoft.Maps.Events.addHandler(this.shape, 'click', this.onPushpinEnter.bind(this));
            this.infobox.setMap(this.map);
        }
        this.map.entities.push(this.shape);
    },

    onPushpinEnter: function() {
        this.clearHideDelay();

        if (!this.infobox.getVisible()) {
            this.infobox.setOptions({
                "visible": true
            });
        }
    },

    onPushpinLeave: function() {
        this.infoboxHideDelayed = function() {
            this.infobox.setOptions({
                "visible": false
            });
        }.bind(this).delay(2);
    },

    onInfoboxEnter: function() {
        this.clearHideDelay();
    },

    onInfoboxLeave: function(box) {
        if (this.infobox.getVisible()) {
            this.infobox.setOptions({
                "visible": false
            });
        }
    },

    clearHideDelay: function() {
        if (this.infoboxHideDelayed) {
            window.clearTimeout(this.infoboxHideDelayed);
            this.infoboxHideDelayed = null;
        }
    },

    toFixedDigits: function(n, m) {
        if (n <= 0) {
            n = 1;
        }
        return (Math.ceil(10 * n * m) / (10 * n));
    },

    makeImageMetadataRequest: function(credentials) {

        var identifier = this.container.identify();

        if (!window[identifier + "MetadataResponse"]) {
            window[identifier + "MetadataResponse"] = function(result) {
                var statusCode = result.statusCode;
                if (result.resourceSets && result.resourceSets.length > 0 && result.resourceSets[0]
                    .estimatedTotal > 0) {
                    var resource = null;
                    for (var i = 0; i < result.resourceSets[0].resources.length; i++) {
                        resource = result.resourceSets[0].resources[i];
                        if (resource.vintageEnd == null && resource.vintageStart == null) {
                            cm4all.ui.overlay.alert(window.mapServiceTranslator.invalidmetadata);
                        }
                    }
                }
            }
        }

        var url = this.RESTImageryBaseUrl + "/Metadata/Aerial/"
        url += this.MetadataOptions.latLong.latitude + "," + this.MetadataOptions.latLong.longitude;
        url += "?zl=" + this.MetadataOptions.zoomlevel;
        url += "&output=json&jsonp=" + identifier + "MetadataResponse&key=" + credentials;

        var script = document.createElement("script");
        script.setAttribute("type", "text/javascript");
        script.setAttribute("src", url);
        document.body.appendChild(script);
    },

    directionsModuleLoaded: function() {
        this.bingUnitMap = {
            'km': Microsoft.Maps.Directions.DistanceUnit.kilometers,
            'mi': Microsoft.Maps.Directions.DistanceUnit.miles
        }
        this.directionsEnabled = true;
    },

    makeRouteRequest: function(credentials) {

        var idPrefix = this.form.container.identify();

        if (this.directionsEnabled !== true) {
            alert("Mapservice not loaded yet");
            return;
        }

        if (document.getElementById(idPrefix + '_itineraryDiv') == null) {
            var divv = new Element('div', {
                id: idPrefix + '_itineraryDiv',
                style: 'font-size: 80%; display: none; overflow:auto;' + (document.documentMode === 7 ? "" : "height:300px;")
            });
            var closeb = new Element('input', {
                type: 'button',
                value: window.mapServiceTranslator.close,
                style: 'color:black;'
            });

            closeb.observe("click", function() {
                this.hideForm();
            }.bind(this));

            var printb = new Element('input', {
                type: 'button',
                value: window.mapServiceTranslator.print,
                style: 'color:black;'
            });

            printb.observe("click", function() {
                this.printForm();
            }.bind(this));


            var divc = new Element('div');
            document.body.appendChild(divv);

            var data = {
                form: divc,
                flyoutCallback: function() {
                    if (divv.parentNode) {
                        divv.parentNode.removeChild(divv);
                    }
                    divv.style.display = "";
                    divc.insert(divv).insert(closeb).insert(printb);
                    divv.observe("mouseover", function() {
                        this.__fixIEMapDisappear__();
                    }.bind(this));

                }.bind(this)
            };
            this.showForm(data);


        }

        var where = this.routeOptions.where;
        var to = this.routeOptions.to;
        var du = this.routeOptions.du;

        // Initialize the DirectionsManager
        if (!this.directionsManager) {
            this.directionsManager = new Microsoft.Maps.Directions.DirectionsManager(this.map);
            // Specify a handler for when an error occurs        
            Microsoft.Maps.Events.addHandler(this.directionsManager, 'directionsUpdated', this.displayRoute
                .bind(this));
            Microsoft.Maps.Events.addHandler(this.directionsManager, 'directionsError', this.displayRouteError
                .bind(this));

        } else {
            this.directionsManager.clearDisplay();
            this.directionsManager.clearAll();
        }

        // Create start and end waypoints
        var startWaypoint = new Microsoft.Maps.Directions.Waypoint({
            address: this.routeOptions.where
        });
        var endWaypoint = new Microsoft.Maps.Directions.Waypoint(this.searchaddress ? {
            address: this.searchaddress
        } : {
            location: this.shape.getLocation()
        });

        this.directionsManager.addWaypoint(startWaypoint);
        this.directionsManager.addWaypoint(endWaypoint);

        // Set the id of the div to use to display the directions
        this.directionsManager.setRenderOptions({
            itineraryContainer: document.getElementById(idPrefix + '_itineraryDiv')
        });

        this.directionsManager.setRequestOptions({
            'distanceUnit': this.bingUnitMap[du]
        });

        // Calculate directions, which displays a route on the map
        this.directionsManager.calculateDirections();
    },

    displayRouteError: function(err) {
        alert(window.mapServiceTranslator.invalidaddress);
        this.hideForm();
    },

    displayRoute: function() {
        return;
    },

    makeGeocodeRequest: function(credentials) {

        var identifier = this.container.identify();

        var query = this.searchOptions.query;

        if (!window[identifier + "GeocodeResponse"]) {
            window[identifier + "GeocodeResponse"] = function(result) {
                var statusCode = result.statusCode;
                if (result.resourceSets && result.resourceSets.length > 0 && result.resourceSets[0]
                    .estimatedTotal > 0) {
                    var resource = null;
					var resources = {};
                    for (var i = 0; i < result.resourceSets[0].resources.length; i++) {
                        resource = result.resourceSets[0].resources[i];
						// Consider only first result of each confidence level
						resources[resource.confidence] = resources[resource.confidence] || resource;
                    }
					resource = resources.High
						|| ((this.searchOptions.confidenceLevel == "Low" || this.searchOptions.confidenceLevel == "Medium") && resources.Medium)
						|| (this.searchOptions.confidenceLevel == "Low" && resources.Low)
						|| null;
					if (resource) {
						this.setPushpin({
                            latLong: new Microsoft.Maps.Location(Number(resource.point.coordinates[0]), Number(resource.point.coordinates[1])), searchaddress: query
                        });
					} else {
                        var message = window.mapServiceTranslator.inconclusiveaddress;
                        this.showMessage(message);
                        if (this.searchOptions.onerror) {
                            this.searchOptions.onerror();
                        }
                        return;
                    }
                } else {
                    var message = window.mapServiceTranslator.invalidaddress;
                    this.showMessage(message + (result.errorDetails ? " " + result.errorDetails : ""));
                    if (this.searchOptions.onerror) {
                        this.searchOptions.onerror();
                    }
                    return;
                }
                if (this.searchOptions.onfinish) {
                    this.hideForm(this.searchOptions.onfinish());
                }
                this.searchOptions.onfinish = null;
            }.bind(this)
        }

        var encodedQuery = (cm4all.HttpURL.urlencode(query)).replace(/\+/g, "%20");
        var url = this.RESTLocationsBaseUrl + "/" + encodedQuery + "?output=json&jsonp=" + identifier
            + "GeocodeResponse&key=" + credentials;
        var script = document.createElement("script");
        script.setAttribute("type", "text/javascript");
        script.setAttribute("src", url);
        document.body.appendChild(script);
    },

    doFind: function(query, errorCallbackFn, delegateCallbackFn) {
        this.searchOptions = {
            query: query,
			confidenceLevel: this.searchConfidenceLevel,
            onerror: errorCallbackFn,
            onfinish: delegateCallbackFn
        }
        this.map.getCredentials(this.makeGeocodeRequest.bind(this));
    },

    doRoute: function(where, to, du, errorCallbackFn) {
        this.routeOptions = {
            where: where,
            to: to,
            du: du,
            onerror: errorCallbackFn
        };
        window.mapServiceCredentialMap.getCredentials(this.makeRouteRequest.bind(this));
    },

    extractRoutingTarget: function() {
        var s = this.contactData.shortname;
        if (!this.contactData.shortname) {
            s = this.parseAddress(this.contactData.description);
            var slength = s.length;
            var send = s.indexOf("<br>");
            if (send == -1) {
                send = slength;
            }
            s = s.substring(0, Math.min(send, 47));
            if (s.length < slength) {
                s = s + "...";
            }
        }
        return s;
    },

    showRoutingForm: function(dir) {
        var idPrefix = this.form.container.identify();
        var form = jQuery("<form action='' />");
        form.submit(function(event) {
            return false;
        });
        var routeInp = jQuery("<input type='text' />");
        routeInp.attr('name', window.mapServiceTranslator.route);
        routeInp.attr('value', '');
        routeInp.attr('id', idPrefix + 'routeInput');

        var routeBtn = jQuery("<input type='button' />");
        routeBtn.attr('value', window.mapServiceTranslator.route);
        routeBtn.attr('name', 'route');
        routeBtn.attr('style', 'color:black;');
        routeBtn.attr('id', idPrefix + 'routeButton');

        routeBtn.click({
            owner: this
        }, function(event) {
            routeBtn.attr('disabled', true);
            routeInp.attr('disabled', true);
            var du = jQuery('input[name=distanceUnit]:checked', form).val();
            event.data.owner.doRoute(routeInp.val(), (dir == "to"), du, function() {
                routeBtn.attr('disabled', false);
                routeBtn.show();
                routeInp.attr('disabled', false);
                routeInp.focus();
            });
        });

        var p0 = jQuery('<p><strong>' + window.mapServiceTranslator.start + '</strong></p>');
        var p1 = jQuery('<p><strong>' + window.mapServiceTranslator.target + '</strong></p>');

        var pUnit = jQuery('<p><strong>' + window.mapServiceTranslator.selectdistanceunit + '</strong>'
            + '<input type="radio" value="km" ' + (this.distanceUnit == "km" ? 'checked="checked"' : '')
            + ' name="distanceUnit" />' + window.mapServiceTranslator.distanceunit("km") + '<input type="radio" value="mi" '
            + (this.distanceUnit == "mi" ? 'checked="checked"' : '') + ' name="distanceUnit" />'
            + window.mapServiceTranslator.distanceunit("mi") + '</p>');

        form.append(p0, routeInp, routeBtn, p1, this.extractRoutingTarget(), pUnit);
        this.showForm({
            form: form,
            flyoutCallback: function() {
                routeBtn.focus();
            }
        });
    },

    showFindForm: function(delegateCallbackFn) {
        var idPrefix = this.form.container.identify();
        var callbackHandlerFormat = "window.callbackHandler.search[\"" + idPrefix + "\"].";
        var theForm = new Element('form', {
            oncancel: 'return false;',
            onsubmit: 'return false;'
        });
        var theInput = new Element('input', {
            id: idPrefix + 'myFindInput',
            type: "text",
            value: "",
            name: "find",
            style: "width: 250px;"
        });
        theInput.addClassName("metadata {layout: {width : 250 } }");
        var theSubmit = new Element('input', {
            onclick: callbackHandlerFormat + "submit();return false;",
            id: idPrefix + 'findButton',
            type: "button",
            value: window.mapServiceTranslator.search
        });
        var theCancel = new Element('input', {
            onclick: callbackHandlerFormat + "cancel();return false;",
            id: idPrefix + 'cancelButton',
            type: "button",
            value: window.mapServiceTranslator.cancel
        });

        if (!window.callbackHandler.search) {
            window.callbackHandler.search = {};
        }
        window.callbackHandler.search[idPrefix] = {};
        window.callbackHandler.search[idPrefix].submit = function() {
            this.doFind($(idPrefix + 'myFindInput').value, function() {
                theInput.focus();
            }, delegateCallbackFn || null);
        }.bind(this);

        window.callbackHandler.search[idPrefix].cancel = function() {
            if (delegateCallbackFn) {
                delegateCallbackFn();
            }
        }.bind(this);

        var fieldsetB = new Element('fieldset');
        fieldsetB.addClassName("metadata {type: 'blank', orientation: 'horizontal' }");

        var str = "<input onclick='" + callbackHandlerFormat + "submit();return false;' id='" + idPrefix
            + "findButton' type='button' value='" + window.mapServiceTranslator.search + "'></input>"
            + "<input onclick='" + callbackHandlerFormat + "cancel();return false;' id='" + idPrefix
            + "cancelButton' type='button' value='" + window.mapServiceTranslator.cancel + "'></input>";

        theForm
            .insert(theInput)
            .insert(fieldsetB.insert(str));

        this.showForm({
            form: theForm,
            flyoutCallback: function() {
                theInput.focus();
            }
        });
    },

    showForm: function(data) {

        this.onInfoboxLeave();

        var doFlyout = function() {
            this.form.wrapper.moved = true;
            this.form.container.style.visibility = "visible";
            this.form.wrapper.style.visibility = "visible";
            new Effect.SlideDown(this.form.wrapper, {
                duration: this.flyoutDuration,
                afterUpdate: function() {
                    this.__fixIEMapDisappear__();
                }.bind(this),
                afterFinish: function() {
                    this.__fixIEMapDisappear__();
                    if (data && Object.isFunction(data.flyoutCallback)) {
                        data.flyoutCallback();
                    }
                }.bind(this)
            });
            this.form.wrapper.scrollIntoView(false);
        }.bind(this);

        var doSetFormContent = (data ? function() {

            jQuery(this.form.container).empty().append(data.form);
            if (window.widgetConf) {
                this.form.container.style.visibility = "hidden";
                this.form.wrapper.style.visibility = "hidden";
                window.cm4all.ui.adapt(data.form);
            }
        }.bind(this) : Prototype.emptyFunction);

        if (this.form.wrapper.moved) {
            this.form.wrapper.moved = false;
            new Effect.SlideUp(this.form.wrapper, {
                duration: this.flyoutDuration / 2,
                afterUpdate: function() {
                    this.__fixIEMapDisappear__();
                }.bind(this),
                afterFinish: function() {
                    this.__fixIEMapDisappear__();
                    doSetFormContent();
                    doFlyout();
                }.bind(this)
            });
        } else {
            doSetFormContent();
            doFlyout();
        }
    },

    showMessage: function(message) {
        alert(message);
    },

    hideForm: function(afterFinishFn) {
        if (this.form.wrapper.moved) {
            this.form.wrapper.moved = false;
            new Effect.SlideUp(this.form.wrapper, {
                duration: this.flyoutDuration / 2,
                afterUpdate: function() {
                    this.__fixIEMapDisappear__();
                }.bind(this),
                afterFinish: function() {
                    this.__fixIEMapDisappear__();
                    if (Object.isFunction(afterFinishFn)) {
                        afterFinishFn();
                    }
                }.bind(this)
            });
        }
    },

    printForm: function() {
    	var du = this.routeOptions.du;
    	var url = this.commonWidget.createUrl("?subaction=print&du="+du, {
            doProcess: true
        });
        window.open(url, "mapWidgetPrint")
    },

    // workaround for IE (a change of e.g. zIndex redisplays map again) 
    __fixIEMapDisappear__: function() {
        this.container.style.zIndex++;
        this.container.style.zIndex--;
    },

    getResourceUrl: function(name) {
        return "/.cm4all/widgetres.php/cm4all.com.widgets.MapServices/" + name;
    }
});