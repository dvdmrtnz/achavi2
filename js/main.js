debugger;

import {LeafletMap, TileLayer, FeatureGroup, CircleMarker, Polyline} from 'leaflet';

import {loadChangeset} from './overpass-api.js';

const COLOR_CREATED = '#faf797';
const COLOR_MODIFIED = '#87cefa';
const COLOR_DELETED = '#ff3333';
const COLOR_GEOM_OLD = '#8b0000';
const COLOR_GEOM_NEW = '#90ee90';
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
 * Always show all tags, even if old or new is missing
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

    const allKeys = new Set([...oldTags.keys(), ...newTags.keys()]);
    const rows = [];

    for (const k of allKeys) {
        const vOld = oldTags.get(k);
        const vNew = newTags.get(k);

        if (vOld === undefined) {
            // Only new (created)
            rows.push(`<tr><td>${k}</td><td></td><td style="color:green;">${vNew}</td></tr>`);
        } else if (vNew === undefined) {
            // Only old (deleted)
            rows.push(`<tr><td>${k}</td><td style="color:red;">${vOld}</td><td></td></tr>`);
        } else if (vOld !== vNew) {
            // Changed
            rows.push(`<tr><td>${k}</td><td style="color:red;">${vOld}</td><td style="color:green;">${vNew}</td></tr>`);
        } else {
            // Unchanged
            rows.push(`<tr><td>${k}</td><td>${vOld}</td><td>${vNew}</td></tr>`);
        }
    }

    if (rows.length === 0) {
        return "<i>No tags</i>";
    }

    return `
        <table border="1" cellpadding="3">
            <tr><th>Key</th><th>Old</th><th>New</th></tr>
            ${rows.join("\n")}
        </table>
    `;
}

/**
 * Render ADIFF XML onto the map
 */
function showAdiffOnMap(adiffXml, map) {

    function processContainer(container, isNew) {
        // nodes
        container.querySelectorAll("node").forEach(node => {
            const lat = parseFloat(node.getAttribute("lat"));
            const lon = parseFloat(node.getAttribute("lon"));
            if (isNaN(lat) || isNaN(lon)) return;

            const id = node.getAttribute("id");
            const oldNode = container.closest("action").querySelector("old node[id='" + id + "']");
            const newNode = container.closest("action").querySelector("new node[id='" + id + "']");

            const geomChanged = oldNode && newNode &&
                (parseFloat(oldNode.getAttribute("lat")) !== parseFloat(newNode.getAttribute("lat")) ||
                parseFloat(oldNode.getAttribute("lon")) !== parseFloat(newNode.getAttribute("lon")));

            let color;
            if (!oldNode) color = COLOR_CREATED;
            else if (!newNode) color = COLOR_DELETED;
            else if (geomChanged) color = isNew ? COLOR_GEOM_NEW : COLOR_GEOM_OLD;
            else color = COLOR_MODIFIED;

            const marker = new CircleMarker([lat, lon], { radius: 5, color });
            const tagDiffHtml = diffTags(oldNode, newNode);

            marker.bindPopup(`
                <b>Node <a href="https://www.openstreetmap.org/node/${id}" target="_blank">${id}</a></b>
                <br>${tagDiffHtml}
            `);

            (isNew ? newLayer : oldLayer).addLayer(marker);
        });

        // ways (same as before)
        container.querySelectorAll("way").forEach(way => {
            const coords = [...way.querySelectorAll("nd")]
                .map(nd => {
                    const lat = parseFloat(nd.getAttribute("lat"));
                    const lon = parseFloat(nd.getAttribute("lon"));
                    return isNaN(lat) || isNaN(lon) ? null : [lat, lon];
                })
                .filter(c => c !== null);

            if (coords.length > 1) {
                const id = way.getAttribute("id");
                const oldWay = container.closest("action").querySelector("old way[id='" + id + "']");
                const newWay = container.closest("action").querySelector("new way[id='" + id + "']");

                let geomChanged = true;
                if (oldWay && newWay) {
                    const oldCoords = [...oldWay.querySelectorAll("nd")].map(nd => [parseFloat(nd.getAttribute("lat")), parseFloat(nd.getAttribute("lon"))]);
                    const newCoords = [...newWay.querySelectorAll("nd")].map(nd => [parseFloat(nd.getAttribute("lat")), parseFloat(nd.getAttribute("lon"))]);
                    geomChanged = oldCoords.length !== newCoords.length || oldCoords.some((c, i) => c[0] !== newCoords[i][0] || c[1] !== newCoords[i][1]);
                }

                let color;
                if (!oldWay) color = COLOR_CREATED;
                else if (!newWay) color = COLOR_DELETED;
                else if (geomChanged) color = isNew ? COLOR_GEOM_NEW : COLOR_GEOM_OLD;
                else color = COLOR_MODIFIED;

                const poly = new Polyline(coords, { color, weight: 5 });
                const tagDiffHtml = diffTags(oldWay, newWay);

                poly.bindPopup(`
                    <b>Way <a href="https://www.openstreetmap.org/way/${id}" target="_blank">${id}</a></b>
                    <br>${tagDiffHtml}
                `);

                (isNew ? newLayer : oldLayer).addLayer(poly);
            }
        });
    }

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
            processContainer(container, version === "new");
        });

        if (!oldContainer && !newContainer) {
            const type = action.getAttribute("type"); // create, modify, delete
            const isNew = type === "create";
            processContainer(action, isNew);
        }
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
