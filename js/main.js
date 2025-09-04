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

/**
 * Compare tags in <old> and <new> elements
 */
function diffTags(oldElem, newElem) {
    const oldTags = new Map();
    const newTags = new Map();

    if (oldElem) {
        oldElem.querySelectorAll("tag").forEach(tag =>
            oldTags.set(tag.getAttribute("k"), tag.getAttribute("v"))
        );
    }
    if (newElem) {
        newElem.querySelectorAll("tag").forEach(tag =>
            newTags.set(tag.getAttribute("k"), tag.getAttribute("v"))
        );
    }

    const changes = [];

    // Removed or changed
    for (const [k, vOld] of oldTags.entries()) {
        if (!newTags.has(k)) {
            changes.push(`<tr><td>${k}</td><td style="color:red;">${vOld}</td><td></td></tr>`);
        } else {
            const vNew = newTags.get(k);
            if (vNew !== vOld) {
                changes.push(`<tr><td>${k}</td><td style="color:red;">${vOld}</td><td style="color:green;">${vNew}</td></tr>`);
            }
        }
    }

    // Added
    for (const [k, vNew] of newTags.entries()) {
        if (!oldTags.has(k)) {
            changes.push(`<tr><td>${k}</td><td></td><td style="color:green;">${vNew}</td></tr>`);
        }
    }

    if (changes.length === 0) {
        return "<i>No tag changes</i>";
    }

    return `
        <table border="1" cellpadding="3">
            <tr><th>Key</th><th>Old</th><th>New</th></tr>
            ${changes.join("\n")}
        </table>
    `;
}

/**
 * Render ADIFF XML onto the map
 */
function showAdiffOnMap(adiffXml, map) {
    if (typeof adiffXml === "string") {
        adiffXml = new DOMParser().parseFromString(adiffXml, "application/xml");
    }

    const oldLayer = new FeatureGroup();
    const newLayer = new FeatureGroup();

    const actions = adiffXml.querySelectorAll("action");

    actions.forEach(action => {
        const oldContainer = action.querySelector("old");
        const newContainer = action.querySelector("new");

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

                // Diff tags for this node
                const oldElem = oldContainer?.querySelector(`node[id="${node.getAttribute("id")}"]`);
                const newElem = newContainer?.querySelector(`node[id="${node.getAttribute("id")}"]`);
                const tagDiffHtml = diffTags(oldElem, newElem);

                marker.bindPopup(`<b>Node ${node.getAttribute("id")}</b><br>${tagDiffHtml}`);

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

                    // Diff tags for this way
                    const oldElem = oldContainer?.querySelector(`way[id="${way.getAttribute("id")}"]`);
                    const newElem = newContainer?.querySelector(`way[id="${way.getAttribute("id")}"]`);
                    const tagDiffHtml = diffTags(oldElem, newElem);

                    poly.bindPopup(`<b>Way ${way.getAttribute("id")}</b><br>${tagDiffHtml}`);
                    
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
