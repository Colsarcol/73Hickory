// Builds docs/content.json from docs/assets/manifest.json plus the room copy below.
// Run after process-images.mjs. Re-running OVERWRITES content.json — if the live
// site has admin edits, pull those first or they will be lost.
import { promises as fs } from 'fs';

const manifest = JSON.parse(await fs.readFile('docs/assets/manifest.json', 'utf8'));

const imgs = (key) =>
  (manifest[key] ?? []).map(({ src, thumb, w, h }) => ({ src, thumb, w, h, caption: '', hidden: false }));

const bp = Object.fromEntries(
  (manifest['bluePrints'] ?? []).map((i) => [i.original.replace(/^bluePrints\/UPDATED/, '').replace(/\.jpe?g$/i, ''), i])
);
const plan = (key, title) =>
  bp[key] ? { src: bp[key].src, thumb: bp[key].thumb, w: bp[key].w, h: bp[key].h, caption: title, hidden: false } : null;

const content = {
  site: {
    title: '73 Hickory Trail',
    location: 'Norris, Tennessee',
    tagline: 'Custom-built elegance backing up to TVA land',
    price: '$969,000',
    status: 'For Sale By Owner',
  },
  hero: {
    image: 'assets/img/outDoor/frontHouse/frontHouse-01.jpg',
    headline: '73 Hickory Trail',
    subheadline: 'A custom-built brick & stone home on a quiet cul-de-sac in Norris, TN',
    ctaText: 'Take the Tour',
  },
  stats: [
    { value: '4,600', label: 'Finished Sq. Ft.' },
    { value: '4 + 1', label: 'Bedrooms (easy 5th)' },
    { value: '3.5', label: 'Bathrooms' },
    { value: '1.08', label: 'Acres, backing TVA land' },
    { value: '3 + 1', label: 'Garage bays' },
    { value: '2006', label: 'Custom built' },
  ],
  about: {
    heading: 'About This Home',
    paragraphs: [
      'Custom built in 2006 with strong attention to detail inside and out, 73 Hickory Trail offers 4,600 finished square feet of brick and faux stone craftsmanship on a quiet cul-de-sac in Norris, Tennessee. The 1.08-acre lot backs directly up to TVA land, with quick and easy access to the watershed trails.',
      'A graceful arch theme carries throughout the home — from the arched entry and transom windows above the main-floor doors and windows to the arched interior details. Every interior door is a solid-core Roman smooth two-panel wood door (no bi-folds, no pockets), and the Jeld-Wen Tenton desert-sand casement windows feature SDL fronts.',
    ],
    features: [
      'Generac Guardian Plus automatic standby natural gas generator',
      'KiTek DTK-WH-5 whole-house surge control on each electrical panel',
      '12-zone alarm system',
      'Salt water swimming pool and hot tub',
      'Central vacuum and copper plumbing',
      'Thomas Kinkade Collection light fixtures with recessed and staircase lighting throughout',
      'Iron balusters and site-finished hardwoods',
      'Full rafter-built attic (no trusses) with abundant storage',
      'Composite decking and LeafFilter gutter guards',
      'Smoke-free since new',
    ],
  },
  sections: [
    {
      id: 'main-floor',
      title: 'Main Floor',
      intro:
        'Step through the arched front entry into a two-story foyer. The formal dining room sits to your left, the open living room straight ahead, and the master suite to your right — with the kitchen, breakfast area, laundry, and walk-in pantry beyond.',
      rooms: [
        {
          id: 'living-room',
          title: 'Foyer & Living Room',
          text: 'The two-story living room opens to the upstairs catwalk and fills with light from transom-topped windows. Iron balusters line the hardwood staircase rising from the foyer.',
          images: imgs('mainfloor/livingRoom'),
        },
        {
          id: 'formal-dining',
          title: 'Formal Dining Room',
          text: 'Just off the foyer, the formal dining room is framed by arched openings and detailed millwork — an elegant setting for gatherings.',
          images: imgs('mainfloor/formalDiningRoom'),
        },
        {
          id: 'kitchen',
          title: 'Kitchen & Breakfast Area',
          text: 'The kitchen centers on a large island with compactor and features a commercial-style separate refrigerator and freezer, six-burner gas stove with pot filler, and double wall oven with warming drawer. The breakfast dining area flows off the living room, and a separate walk-in pantry sits just beyond.',
          images: imgs('mainfloor/kitchen'),
        },
        {
          id: 'master-bedroom',
          title: 'Master Bedroom',
          text: 'The main-floor master suite is a private retreat with generous his-and-her closets.',
          images: imgs('mainfloor/masterBedroom'),
        },
        {
          id: 'master-bathroom',
          title: 'Master Bathroom',
          text: 'The large master ensuite offers his-and-her vanities, his-and-her shower heads, and abundant storage.',
          images: imgs('mainfloor/masterBathroom'),
        },
        {
          id: 'laundry',
          title: 'Laundry Room',
          text: 'A separate dedicated laundry room sits conveniently off the kitchen, near the garage entry.',
          images: imgs('mainfloor/laundryRoom'),
        },
      ],
    },
    {
      id: 'upstairs',
      title: 'Upstairs',
      intro:
        'Cross the catwalk overlooking the living room to reach an open den, two bedrooms — one with its own upper patio — a bathroom with separate sink area, and a large finished bonus room with hidden extras.',
      rooms: [
        {
          id: 'catwalk-den',
          title: 'Catwalk & Den',
          text: 'The catwalk spans the open living room below and leads to a bright open den — a flexible space for reading, play, or a home office.',
          images: imgs('upStairsFloor/catwalkDen'),
        },
        {
          id: 'first-bedroom',
          title: 'Bedroom One',
          text: 'A comfortable bedroom with a double-door closet — and a secret door connecting to the finished lower attic playroom.',
          images: imgs('upStairsFloor/firstBedRoom'),
        },
        {
          id: 'patio-bedroom',
          title: 'Bedroom Two with Upper Patio',
          text: 'This bedroom opens onto its own private upper patio with composite decking — morning coffee with a treetop view.',
          images: imgs('upStairsFloor/patioRoom'),
        },
        {
          id: 'upstairs-bath',
          title: 'Upstairs Bathroom',
          text: 'Separate dual sink area with a private door to the bathroom and tub/shower — easy sharing for busy mornings.',
          images: imgs('upStairsFloor/bathroom'),
        },
        {
          id: 'bonus-room',
          title: 'Bonus Room',
          text: 'A large finished bonus room — the easy fifth bedroom — with two separate attic storage areas and a finished lower attic featuring a secret door into Bedroom One, making a one-of-a-kind playroom.',
          images: imgs('upStairsFloor/bonusRoom'),
        },
      ],
    },
    {
      id: 'lower-level',
      title: 'Lower Level',
      intro:
        'Downstairs offers a theater room with projector, a large living area opening to the pool, a full bathroom, a ventilated craft room, a fourth garage bay, and storage everywhere you look — including an under-porch storage room with steel door.',
      rooms: [
        {
          id: 'theater',
          title: 'Theater Room',
          text: 'A dedicated theater room with projector — movie nights without leaving home.',
          images: imgs('basementFloor/theaterRoom'),
        },
        {
          id: 'lower-living',
          title: 'Lower Living Room',
          text: 'The large lower-level living area walks straight out to the pool and patio, with a full bathroom just to the side.',
          images: imgs('basementFloor/livingRoom'),
        },
        {
          id: 'lower-bath',
          title: 'Full Bathroom',
          text: 'A full bathroom serves the lower level and the pool — no wet feet through the house.',
          images: imgs('basementFloor/bathroom'),
        },
        {
          id: 'craft-room',
          title: 'Craft Room',
          text: 'A dedicated craft room with an evacuation fan — perfect for projects that need ventilation — plus a large attached storage area.',
          images: imgs('basementFloor/craftRoom'),
        },
        {
          id: 'lower-garage',
          title: 'Stairway & Lower Garage',
          text: 'The staircase leads down to the lower level, where a fourth garage bay makes an ideal workshop with drive-in access.',
          images: [...imgs('basementFloor'), ...imgs('basementFloor/understairs')],
        },
        {
          id: 'utility',
          title: 'Utility & Storage',
          text: 'The utility room sits behind the theater, with additional storage under the stairs and an under-porch storage area secured by a steel door.',
          images: imgs('basementFloor/utilityRoom'),
        },
      ],
    },
    {
      id: 'outdoors',
      title: 'Outdoor Living',
      intro:
        'A large in-ground salt water pool with slide and diving board, hot tub, pool house, and composite-decked patios — all backing up to protected TVA land.',
      rooms: [
        {
          id: 'pool',
          title: 'Salt Water Pool',
          text: 'The in-ground salt water pool features a slide, diving board, and pool house, surrounded by a paver deck and iron fencing with woods beyond.',
          images: imgs('outDoor/pool'),
        },
        {
          id: 'patio',
          title: 'Patios & Decks',
          text: 'Multiple outdoor living spaces with composite decking overlook the pool and the wooded TVA land behind the property.',
          images: imgs('outDoor/patio'),
        },
        {
          id: 'front',
          title: 'Curb Appeal',
          text: 'Brick and faux stone, arched windows, and a circle drive on a quiet cul-de-sac.',
          images: imgs('outDoor/frontHouse'),
        },
      ],
    },
  ],
  floorplans: {
    heading: 'Floor Plans',
    intro: 'Original architectural drawings — floor plans and all four elevations.',
    images: [
      plan('mainFloor', 'Main Floor Plan'),
      plan('upperFloor', 'Upper Floor Plan'),
      plan('basementFloor', 'Lower Level Plan'),
      plan('front', 'Front Elevation'),
      plan('rear', 'Rear Elevation'),
      plan('left', 'Left Elevation'),
      plan('right', 'Right Elevation'),
    ].filter(Boolean),
  },
  contact: {
    heading: 'Schedule a Showing',
    blurb: 'For sale by owner. Reach out any time to ask questions or arrange a private tour.',
    name: 'Joe Mawhinney',
    phone: '865-243-7653',
    email: '73hickory@mawemail.com',
  },
};

await fs.writeFile('docs/content.json', JSON.stringify(content, null, 2));
console.log('Wrote docs/content.json');
