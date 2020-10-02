import { PolymerElement, html } from '@polymer/polymer/polymer-element.js';
import { setPassiveTouchGestures, setRootPath } from '@polymer/polymer/lib/utils/settings.js';
import '@polymer/app-layout/app-drawer/app-drawer.js';
import '@polymer/app-layout/app-drawer-layout/app-drawer-layout.js';
import '@polymer/app-layout/app-header/app-header.js';
import '@polymer/app-layout/app-scroll-effects/app-scroll-effects.js';
import '@polymer/app-layout/app-toolbar/app-toolbar.js';
import '@polymer/paper-icon-button/paper-icon-button.js';
import '@polymer/paper-slider/paper-slider.js';
import '@polymer/paper-input/paper-input.js';
import '@polymer/paper-button/paper-button.js';
import './icons.js';

// Need these side effects
import 'leaflet/src/control';
import 'leaflet/src/core';
import 'leaflet/src/layer';
import { Map } from 'leaflet/src/map';
import { TileLayer } from 'leaflet/src/layer/tile';

// Gesture events like tap and track generated from touch will not be
// preventable, allowing for better scrolling performance.
setPassiveTouchGestures(true);

// Set Polymer's root path to the same value we passed to our service worker
// in `index.html`.
setRootPath(PlanetAppGlobals.rootPath);

class PlanetApp extends PolymerElement {
  static get template() {
    return html`

      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.3.1/dist/leaflet.css" />
      <!-- FIXME: Figure out Shadow DOM so this doesn't have to be included here -->
      <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.3.0/dist/MarkerCluster.css" media="screen">
      <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.3.0/dist/MarkerCluster.Default.css" media="screen">

      <style>
        :host {
          --app-primary-color: #009da5;
          --app-secondary-color: black;
          display: block;
        }

        [hidden] {
          display: none !important;
        }

        app-header {
          color: #fff;
          background-color: var(--app-primary-color);
        }

        paper-icon-button.white {
          background-color: white;
          border-radius: 5px;
        }

        #map-overlay {
          position: absolute;
          z-index: 999;
          left: 7px;
          top: 80px;
        }

        #map {
          position: absolute;
          left: 0;
          right: 0;
          top: 0;
          bottom: 0;
        }

        #sidebar {
          margin: 5px;

        }

      </style>

      <app-drawer-layout fullbleed="" force-narrow="[[forceNarrow_]]">
        <app-drawer id="drawer" slot="drawer" swipe-open="">
          <app-header fixed="">
            <app-toolbar>Planet Data Viewer</app-toolbar>
          </app-header>
          <div id="sidebar">

            <div>
              Satellite Opacity ([[opacity]]%)
              <paper-slider min="0" max="100" value="[[opacity]]" immediate-value="{{opacity}}"></paper-slider>
            </div>

            <div>
              <paper-input label="Imagery Date" always-float-label="" id="dateinput" value="2020-09-30"></paper-input>
              <paper-button raised="" on-tap="loadTiles_">Load Tiles</paper-button>
            </div>

            <div hidden="[[!tileUrl_]]">
              <div>
                <p>
                <small>
                  The CalTopo generated link is brittle so I wouldn't be surprised if it breaks in the future.
                </small>
              </div>
              <div>
                <paper-button raised="" on-tap="openCaltopo_">Open View in CalTopo</paper-button>
              </div>
            </div>
 

          </div>
        </app-drawer>
        <div id="map-overlay">
          <paper-icon-button class="white" icon="icons:menu" on-tap="drawerToggle_"></paper-icon-button>
        </div>
        <div id="map">
        </div>
      </app-drawer-layout>
    `;
  }

  static get properties() {
    return {
      forceNarrow_: Boolean,

      opacity: {
        type: Number,
        value: 100,
        observer: 'onOpacity_',
      },

      map: {
        type: Object,
      },

      tileName_: {
        type: String,
      },
      tileUrl_: {
        type: String,
        value: '',
      },

      planetLayer: {
        type: Object,
      },

      zoom: {
        type: Number,
      },
      bounds: {
        type: Object,
      },
    };
  }

  loadTiles_() {
    this.tileName_ = 'Planet ' + this.$.dateinput.value;
    this.planetLayer.setUrl('/api/tile/{z}/{x}/{y}.png?date=' + this.$.dateinput.value);
    this.tileUrl_ = '/api/tile/{Z}/{X}/{Y}.png?date=' + this.$.dateinput.value;
  }

  openCaltopo_() {
    const center = this.bounds.getCenter();

    const tiles = 'https://planet.jeffheidel.com' + this.tileUrl_;
    const t1 = '{"template":"' + tiles + '","type":"TILE","maxzoom":"20"}'
    const t2 = '{"custom":[{"properties":{"title":"' + this.tileName_ + '","template":"' + tiles + '","type":"TILE","maxzoom":"20","alphaOverlay":false,"class":"CustomLayer"},"id":""}]}';
    const enc = encodeURIComponent(encodeURIComponent(t1)) + '&n=1&cl=' + encodeURIComponent(t2);
    const url = 'https://caltopo.com/map.html#ll=' + center.lat + ',' + center.lng + '&z=' + this.zoom + '&b=mbt&o=cl_' + enc;

    window.open(url, '_blank');
  }

  newBounds_(zoom, bounds) {
    this.zoom = zoom;
    this.bounds = bounds;

    // TODO new API request
  }

  connectedCallback() {
    super.connectedCallback();

    this.map = new Map(this.$.map, {
      center: [47.5, -119],
      zoom: 7,
      inertiaDeceleration: 3000,
      inertiaMaxSpeed: 3000,
      tapTolerance: 40,
      tap: false
    });
    this.map.on('moveend', () => {
      this.newBounds_(this.map.getZoom(), this.map.getBounds());
    });
    this.map.setView([47.5, -119], 7);


    const baseLayer = new TileLayer('https://tile.thunderforest.com/landscape/{z}/{x}/{y}.png?apikey=b99b298d147e4c8fafd7929f48e816cc', {
        attribution: '&copy; <a href="https://www.thunderforest.com/">Thunderforest</a>'
    });
    baseLayer.addTo(this.map);

    this.planetLayer = new TileLayer('', {
        attribution: '&copy; <a href="https://www.planet.com/">Planet</a>'
    });
    this.planetLayer.addTo(this.map);

    // TODO need viewport to issue ajax request....
  }

  onOpacity_(v) {
    if (!this.planetLayer) {
      return;
    }
    this.planetLayer.setOpacity(v / 100);
  }

  drawerToggle_() {
    console.log("toggle");
    this.$.drawer.toggle();
    this.forceNarrow_ = !this.$.drawer.opened;
  }
}

window.customElements.define('planet-app', PlanetApp);
