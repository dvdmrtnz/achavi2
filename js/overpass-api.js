
async function getChangesetMetadata(changesetId) {
    const url = `https://www.openstreetmap.org/api/0.6/changeset/${changesetId}`;
    const res = await fetch(url);
    const xmlText = await res.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, "application/xml");
    const cs = xml.querySelector("changeset");

    if (!cs) {
        throw new Error("No changeset found");
    }

    return {
        from: cs.getAttribute("created_at"),
        to: cs.getAttribute("closed_at"),
        bbox: {
            left: parseFloat(cs.getAttribute("min_lon")),
            bottom: parseFloat(cs.getAttribute("min_lat")),
            right: parseFloat(cs.getAttribute("max_lon")),
            top: parseFloat(cs.getAttribute("max_lat"))
        }
    };
}

async function fetchOverpassDiff(from, to, bbox, query) {
    // format dates using native Date
    const mindate = new Date(from).toISOString().replace(/\.\d{3}Z$/, "Z");
    const maxdate = to ? new Date(to).toISOString().replace(/\.\d{3}Z$/, "Z") : '';

    let dateRange = `"${mindate}"` + (maxdate ? `,"${maxdate}"` : '');

    query = `(node(bbox)(changed);way(bbox)(changed););`;

    // build URL
    const data_url = 'https://overpass-api.de/api/interpreter';
    let url = `${data_url}?data=[adiff:${dateRange}];${query}out meta geom(bbox);`;

    // add bbox
    const bboxParam = `&bbox=${bbox.left},${bbox.bottom},${bbox.right},${bbox.top}`;
    url += bboxParam;

    console.log("Requesting URL:", url);

    try {
        const res = await fetch(url);
        const text = await res.text();
        console.log("Overpass XML result:\n", text);
        return text;
    } catch (err) {
        console.error("Error fetching Overpass diff:", err);
    }
}

export async function loadChangeset(id) {

    try {
        // Step 1: get changeset metadata
        const csInfo = await getChangesetMetadata(id);
        const fromDate = new Date(csInfo.from);
        fromDate.setSeconds(fromDate.getSeconds() - 1); // workaround: subtract 1 second from start date
        const from = fromDate.toISOString();
        const to = csInfo.to;
        const bbox = csInfo.bbox;

        console.log(`Changeset ${id} from ${from} to ${to} in bbox`, bbox);

        // Step 2: fetch diff from Overpass
        const adiffXml = await fetchOverpassDiff(from, to, bbox);
        return adiffXml

    } catch (err) {
        console.error("Error loading changeset:", err);
    }
}