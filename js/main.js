debugger;

import {LeafletMap, TileLayer, FeatureGroup, CircleMarker, Polyline} from 'leaflet';

import {loadChangeset} from './overpass-api.js';

const COLOR_OLD = 'darkred';
const COLOR_NEW = 'lightgreen';
const TILE_DARKNESS = 'brightness(30%)';

const map = new LeafletMap('map').setView([51.505, -0.09], 13);

const tiles = new TileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

// Apply a dark filter to the tile layer
tiles._container.style.filter = TILE_DARKNESS;

function showAdiffOnMap(adiffXml, map) {
    if (typeof adiffXml === "string") {
        adiffXml = new DOMParser().parseFromString(adiffXml, "application/xml");
    }

    const oldLayer = new FeatureGroup();
    const newLayer = new FeatureGroup();

    const actions = adiffXml.querySelectorAll("action");

    actions.forEach(action => {
        ["old", "new"].forEach(version => {
            const container = action.querySelector(version);
            if (!container) return;

            const isNew = version === "new";

            // nodes
            container.querySelectorAll("node").forEach(node => {
                const lat = parseFloat(node.getAttribute("lat"));
                const lon = parseFloat(node.getAttribute("lon"));

                if (isNaN(lat) || isNaN(lon)) return;

                const marker = new CircleMarker([lat, lon], {
                    radius: 5,
                    color: isNew ? COLOR_NEW : COLOR_OLD
                });

                marker.bindPopup(`<b>Node ${node.getAttribute("id")}</b>`);
                
                (isNew ? newLayer : oldLayer).addLayer(marker);
            });

            // ways
            container.querySelectorAll("way").forEach(way => {
                const coords = [...way.querySelectorAll("nd")].map(nd => {
                    const lat = parseFloat(nd.getAttribute("lat"));
                    const lon = parseFloat(nd.getAttribute("lon"));
                    return isNaN(lat) || isNaN(lon) ? null : [lat, lon];
                })
                .filter(c => c !== null);

                if (coords.length > 1) {
                    const poly = new Polyline(coords, { color: isNew ? COLOR_NEW : COLOR_OLD , weight: 5 });

                    poly.bindPopup(`<b>Way ${way.getAttribute("id")}</b>`);

                    (isNew ? newLayer : oldLayer).addLayer(poly);
                }
            });
        });
    });

    oldLayer.addTo(map);
    newLayer.addTo(map);

    // combine both layers to fit map
    const combined = new FeatureGroup([oldLayer, newLayer]);
    if (combined.getBounds().isValid()) {
        map.fitBounds(combined.getBounds());
    }
}

// Get controls
const input = document.getElementById('changesetId');
const button = document.getElementById('loadBtn');

// Button click loads the changeset
button.addEventListener('click', async () => {

    map.eachLayer(layer => {
        if (layer instanceof FeatureGroup) map.removeLayer(layer);
    });

    const id = parseInt(input.value, 10);
    const adiffXml = await loadChangeset(id);
    showAdiffOnMap(adiffXml, map);
});
