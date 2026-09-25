"""Refresh bills-data.json (the Tech Policy Tracker box on the Policy
Artifacts page) from the Integrity Institute's Tech Policy Tracker.
Run by .github/workflows/refresh-bills.yml once a day, and runnable by
hand from the project root:  python3 scripts/refresh_bills.py

This is the same source the Tech Policy Hub's signal ticker uses, and the
same method (see Tech-Policy-Hub/build/refresh_ticker.py for the full
background). The tracker sites (us-federal.techpolicytracker.com,
us-state.techpolicytracker.com) have no documented public API, but both
run on a public Typesense search backend, and each site's own shipped JS
embeds a scoped, read-only "search-only" key for it. That is Typesense's
standard pattern for public search widgets, so this script issues the
same read-only queries the tracker's own pages issue. It is unofficial
and could stop matching if the tracker changes its frontend, so the
script fails loudly (and leaves the last good bills-data.json alone)
instead of writing an empty or partial file.

Differences from the Hub's version:
  - covers every state plus D.C. and Puerto Rico, not just MD / VA / DC:
    it asks for each one separately (the newest PER_STATE bills from
    each), so a few busy legislatures can't crowd the others out
  - keeps more bills (the box scrolls through them three at a time)
  - records the bill code, title, introduction date, and jurisdiction
    separately so the page can lay them out
The theme filter (CORE_THEMES) is the Hub's hand-verified list, which
keeps the results on AI, privacy, cybersecurity, and information
integrity rather than every bill that mentions technology.
"""
import datetime
import json
import os
import sys
import urllib.error
import urllib.request

TYPESENSE_HOST = "6b02zkvpmslnjyd8p-1.a1.typesense.net"

# The tracker sites' own public, read-only search-only keys (not secrets,
# not ours); same values as Tech-Policy-Hub/build/refresh_ticker.py.
FEDERAL_COLLECTION = "bills_federal"
FEDERAL_KEY = "JrkZtt5wKSNACgUpSrJNdZ8n3hhmGdEK"
STATE_COLLECTION = "bills_US_State"
STATE_KEY = "MmG4uqUrWwR3mjdnmLKptvXfPaOLLgCC"

CORE_THEMES = [
    "Cybersecurity and Information Security",
    "Software and Device Security",
    "Data Privacy and Protection",
    "Digital Identity and Biometrics",
    "Misinformation and Deceptive Practices",
    "Artificial Intelligence and Machine Learning",
]

FEDERAL_LIMIT = 10
PER_STATE = 2   # newest bills kept from each state

STATE_ABBR = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA",
    "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE", "District of Columbia": "DC",
    "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID", "Illinois": "IL",
    "Indiana": "IN", "Iowa": "IA", "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA",
    "Maine": "ME", "Maryland": "MD", "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN",
    "Mississippi": "MS", "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
    "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
    "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK", "Oregon": "OR",
    "Pennsylvania": "PA", "Puerto Rico": "PR", "Rhode Island": "RI", "South Carolina": "SC",
    "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT", "Vermont": "VT",
    "Virginia": "VA", "Washington": "WA", "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY",
}

OUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "bills-data.json")


def typesense_search(collection, api_key, limit, state=None):
    theme_filter = "Themes:=[" + ",".join(CORE_THEMES) + "]"
    # backticks let state names with spaces ("New York") pass through Typesense's filter syntax
    filter_by = f"State:=[`{state}`] && {theme_filter}" if state else theme_filter
    body = json.dumps({
        "searches": [{
            "collection": collection,
            "q": "*",
            "query_by": "Name",
            "filter_by": filter_by,
            "sort_by": "Intro date:desc",
            "per_page": limit,
        }]
    }).encode("utf-8")
    url = f"https://{TYPESENSE_HOST}/multi_search?x-typesense-api-key={api_key}"
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    result = data["results"][0]
    if result.get("error"):
        raise RuntimeError(f"Typesense error for {collection}: {result['error']}")
    return [hit["document"] for hit in result.get("hits", [])]


def iso_date(value):
    """The tracker's 'Intro date' is sortable, but its exact format isn't
    documented; accept a Unix timestamp (seconds or ms) or a date string,
    and fall back to '' rather than guessing.

    Slash dates are read day-first (12/05/2026 = 12 May), which is what the
    tracker's data turned out to use: reading them month-first put bills
    introduced in May into December. As a backstop, a date that lands in the
    future is flipped to day/month order when that gives a past date."""
    today = datetime.date.today()
    if isinstance(value, (int, float)) and value > 0:
        ts = value / 1000 if value > 1e11 else value
        return datetime.datetime.utcfromtimestamp(ts).date().isoformat()
    if isinstance(value, str) and value.strip():
        text = value.strip()[:10]
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d"):
            try:
                d = datetime.datetime.strptime(text, fmt).date()
            except ValueError:
                continue
            if d > today and d.day <= 12:
                try:
                    flipped = d.replace(month=d.day, day=d.month)
                    if flipped <= today:
                        d = flipped
                except ValueError:
                    pass
            return d.isoformat()
    return ""


def to_item(doc, federal):
    name = doc.get("Name", "").strip()
    code, title = name.split(": ", 1) if ": " in name else ("", name)
    if federal:
        code_j, label = "US", "Federal"
    else:
        label = str(doc.get("State", "")).strip()
        code_j = STATE_ABBR.get(label, label[:2].upper())
    return {
        "jurisdiction": code_j,
        "jurisdiction_name": label,
        "code": code.strip(),
        "title": title.strip(),
        "date": iso_date(doc.get("Intro date")),
        "link": doc.get("Entity site") or doc.get("State site") or doc.get("Legiscan") or "",
    }


def main():
    items = []
    try:
        federal = typesense_search(FEDERAL_COLLECTION, FEDERAL_KEY, FEDERAL_LIMIT)
        state_docs = []
        for state_name in STATE_ABBR:
            state_docs.extend(typesense_search(STATE_COLLECTION, STATE_KEY, PER_STATE, state_name))
    except (urllib.error.URLError, RuntimeError, KeyError, json.JSONDecodeError) as exc:
        # any failed request stops the run so a partial list never replaces a full one
        print(f"ERROR fetching bills: {exc}", file=sys.stderr)
        sys.exit(1)
    # a quiet state can have no matching bills; only an empty result overall is a problem
    if not federal:
        print("ERROR: 0 federal results; the tracker's data or schema may have changed", file=sys.stderr)
        sys.exit(1)
    if not state_docs:
        print("ERROR: 0 state results; the tracker's data or schema may have changed", file=sys.stderr)
        sys.exit(1)
    items.extend(to_item(d, True) for d in federal)
    items.extend(to_item(d, False) for d in state_docs)

    items = [i for i in items if i["title"]]
    # newest first across federal and state; undated bills go last
    items.sort(key=lambda i: i["date"] or "0000-00-00", reverse=True)

    # leave the file untouched when the bills haven't changed, so the daily
    # workflow only commits (and redeploys) when there is something new
    try:
        with open(OUT_PATH) as f:
            if json.load(f).get("items") == items:
                print("bills unchanged; bills-data.json left as is")
                return
    except (OSError, ValueError):
        pass

    out = {
        "generated_by": "scripts/refresh_bills.py",
        "generated_at": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "Integrity Institute Tech Policy Tracker (us-federal.techpolicytracker.com, us-state.techpolicytracker.com)",
        "items": items,
    }
    with open(OUT_PATH, "w") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
        f.write("\n")
    states = len({i["jurisdiction"] for i in items if i["jurisdiction"] != "US"})
    print(f"wrote {len(items)} bills ({states} states and territories plus federal) to {os.path.normpath(OUT_PATH)}")


if __name__ == "__main__":
    main()
