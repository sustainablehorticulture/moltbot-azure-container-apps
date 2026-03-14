/**
 * FarmContent — fetches live Agentic Ag dashboard data for Red Dog marketing.
 *
 * Sources:
 *   - Products/inventory: [zerosumag].[dbo].[Farm_Products] (fallback: known catalog)
 *   - Eco-Stay:           [zerosumag].[dbo].[Accommodations] + [Accommodation_Bookings]
 *   - Marketplace:        Products + Carbon/Biodiversity credits
 *   - Courses:            courses.json (already loaded by CourseTeacher)
 *   - Check-in log:       [zerosumag].[dbo].[Product_CheckIn_Log] (if persisted)
 */

const fs   = require('fs');
const path = require('path');

// Known product catalog — used as fallback when DB is not available
const KNOWN_PRODUCTS = [
    { id: 'fresh-chillies',         name: 'Fresh Chillies',         category: 'Produce',  unit: 'kg',     price: 12.50, barcode: '9300675024235' },
    { id: 'blue-corn',              name: 'Blue Corn',              category: 'Grain',    unit: 'kg',     price: 8.00,  barcode: '9300675024242' },
    { id: 'white-corn',             name: 'White Corn',             category: 'Grain',    unit: 'kg',     price: 6.50,  barcode: '9300675024259' },
    { id: 'sweet-corn',             name: 'Sweet Corn',             category: 'Produce',  unit: 'dozen',  price: 15.00, barcode: '9300675024266' },
    { id: 'blood-orange',           name: 'Blood Orange',           category: 'Citrus',   unit: 'kg',     price: 9.00,  barcode: '9300675024273' },
    { id: 'lemon',                  name: 'Lemon',                  category: 'Citrus',   unit: 'kg',     price: 5.50,  barcode: '9300675024280' },
    { id: 'red-grapefruit',         name: 'Red Grapefruit',         category: 'Citrus',   unit: 'kg',     price: 7.00,  barcode: '9300675024297' },
    { id: 'lime',                   name: 'Lime',                   category: 'Citrus',   unit: 'kg',     price: 8.50,  barcode: '9300675024303' },
    { id: 'oranges',                name: 'Oranges',                category: 'Citrus',   unit: 'kg',     price: 4.50,  barcode: '9300675024310' },
    { id: 'sides-of-lamb',          name: 'Sides of Lamb',          category: 'Meat',     unit: 'side',   price: 180.00, barcode: '9300675024327' },
    { id: 'sides-of-beef',          name: 'Sides of Beef',          category: 'Meat',     unit: 'side',   price: 450.00, barcode: '9300675024334' },
    { id: 'ethanol',                name: 'Ethanol',                category: 'Biofuel',  unit: 'L',      price: 2.80,  barcode: '9300675024341' },
    { id: 'grassgum-agave-spirit',  name: 'Grassgum Agave Spirit',  category: 'Spirit',   unit: 'bottle', price: 85.00, barcode: '9300675024358' },
    { id: 'carbon-credits',         name: 'Carbon Credits',         category: 'Credits',  unit: 'tonne',  price: 35.00, barcode: null },
    { id: 'biodiversity-credits',   name: 'Biodiversity Credits',   category: 'Credits',  unit: 'unit',   price: 120.00, barcode: null },
];

const COURSES_PATH = path.join(__dirname, 'courses.json');

class FarmContent {
    constructor(db) {
        this.db = db;
        this._productCache  = null;
        this._productCacheTs = 0;
        this._ecoStayCache  = null;
        this._ecoStayCacheTs = 0;
        this.cacheTTL = 5 * 60 * 1000; // 5 minutes
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    _isCacheValid(ts) {
        return ts && (Date.now() - ts) < this.cacheTTL;
    }

    async _query(sql, fallback = []) {
        if (!this.db || !this.db.isConnected) return fallback;
        try {
            return await this.db.query(sql, [], 'zerosumag');
        } catch (err) {
            console.warn('[FarmContent] DB query failed:', err.message);
            return fallback;
        }
    }

    // ── Products / Inventory ─────────────────────────────────────────────────

    /**
     * Get all farm products with current stock levels.
     * Tries DB first, falls back to known catalog.
     */
    async getProducts() {
        if (this._isCacheValid(this._productCacheTs)) return this._productCache;

        const rows = await this._query(`
            SELECT id, name, category, unit, price, stock, available
            FROM [dbo].[Farm_Products]
            WHERE available = 1
            ORDER BY category, name
        `);

        const products = rows.length > 0
            ? rows.map(r => ({
                id:       r.id,
                name:     r.name,
                category: r.category,
                unit:     r.unit,
                price:    parseFloat(r.price),
                stock:    parseInt(r.stock || 0),
                available: r.available
            }))
            : KNOWN_PRODUCTS.map(p => ({ ...p, stock: null })); // stock unknown when using fallback

        this._productCache   = products;
        this._productCacheTs = Date.now();
        return products;
    }

    /**
     * Get product by name (case-insensitive) or barcode
     */
    async findProduct(query) {
        const products = await this.getProducts();
        const q = query.toLowerCase();
        return products.find(p =>
            p.name.toLowerCase().includes(q) ||
            p.id.toLowerCase().includes(q) ||
            p.barcode === q
        ) || null;
    }

    /**
     * Get in-stock products (stock > 0 or unknown)
     */
    async getAvailableProducts() {
        const products = await this.getProducts();
        return products.filter(p => p.stock === null || p.stock > 0);
    }

    /**
     * Get recent check-in log (last 24h)
     */
    async getRecentCheckIns() {
        return this._query(`
            SELECT TOP 20
                cl.productName, cl.category, cl.quantity, cl.unit,
                cl.method, cl.checkedInBy, cl.timestamp
            FROM [dbo].[Product_CheckIn_Log] cl
            WHERE cl.timestamp >= DATEADD(HOUR, -24, GETUTCDATE())
            ORDER BY cl.timestamp DESC
        `);
    }

    // ── Eco-Stay / Agritourism ───────────────────────────────────────────────

    /**
     * Get all accommodation listings with current availability
     */
    async getEcoStay() {
        if (this._isCacheValid(this._ecoStayCacheTs)) return this._ecoStayCache;

        const accommodations = await this._query(`
            SELECT
                a.id, a.name, a.type, a.description,
                a.capacity, a.price_per_night, a.available,
                a.amenities, a.image_url
            FROM [dbo].[Accommodations] a
            WHERE a.available = 1
            ORDER BY a.type, a.name
        `);

        // Get booked dates for next 30 days
        const bookings = await this._query(`
            SELECT
                b.accommodation_id,
                b.check_in_date,
                b.check_out_date,
                b.status
            FROM [dbo].[Accommodation_Bookings] b
            WHERE b.status IN ('confirmed', 'pending', 'checked-in')
              AND b.check_in_date >= CAST(GETDATE() AS DATE)
              AND b.check_in_date <= DATEADD(DAY, 30, CAST(GETDATE() AS DATE))
            ORDER BY b.check_in_date
        `);

        // Build booked dates map
        const bookedMap = {};
        for (const b of bookings) {
            if (!bookedMap[b.accommodation_id]) bookedMap[b.accommodation_id] = [];
            bookedMap[b.accommodation_id].push({
                checkIn:  b.check_in_date,
                checkOut: b.check_out_date,
                status:   b.status
            });
        }

        // If no DB data, use known eco-stay listings
        const listings = accommodations.length > 0 ? accommodations : this._knownEcoStay();

        const result = listings.map(a => ({
            ...a,
            pricePerNight: parseFloat(a.price_per_night || a.pricePerNight || 0),
            bookedDates: bookedMap[a.id] || [],
            nextAvailable: this._nextAvailableDate(bookedMap[a.id] || [])
        }));

        this._ecoStayCache   = result;
        this._ecoStayCacheTs = Date.now();
        return result;
    }

    _knownEcoStay() {
        return [
            { id: 1, name: 'Grassgum Farmhouse',    type: 'farmhouse',  description: 'Original homestead with 3 bedrooms, country kitchen and verandah views', capacity: 6, price_per_night: 350, available: 1 },
            { id: 2, name: 'The Silo Loft',          type: 'loft',       description: 'Converted grain silo with stunning 360° views of the farm', capacity: 2, price_per_night: 220, available: 1 },
            { id: 3, name: 'Agave Trail Glamping',   type: 'glamping',   description: 'Luxury bell tents nestled in the agave fields with private fire pits', capacity: 2, price_per_night: 185, available: 1 },
            { id: 4, name: 'Harvest Cottage',        type: 'cottage',    description: 'Self-contained cottage beside the orchard, perfect for families', capacity: 4, price_per_night: 280, available: 1 },
        ];
    }

    _nextAvailableDate(bookings) {
        if (!bookings.length) return 'Available now';
        const today = new Date();
        today.setHours(0,0,0,0);
        const sorted = [...bookings].sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn));
        for (const b of sorted) {
            const checkIn = new Date(b.checkIn);
            if (checkIn > today) return `Next available: ${checkIn.toLocaleDateString('en-AU')}`;
        }
        return 'Available now';
    }

    // ── Courses ───────────────────────────────────────────────────────────────

    /**
     * Get course catalog from courses.json
     */
    getCourses() {
        try {
            const data = JSON.parse(fs.readFileSync(COURSES_PATH, 'utf8'));
            return data.courses || [];
        } catch {
            return [];
        }
    }

    getOnlineCourses() {
        return this.getCourses().filter(c => c.category === 'online');
    }

    getOnsiteCourses() {
        return this.getCourses().filter(c => c.category !== 'online');
    }

    // ── Marketing Content Builder ──────────────────────────────────────────────

    /**
     * Build a rich context string for the AI engine system prompt.
     * Injected into every chat so Red Dog always has current farm data.
     */
    async buildMarketingContext() {
        const [products, ecoStay] = await Promise.all([
            this.getAvailableProducts().catch(() => KNOWN_PRODUCTS),
            this.getEcoStay().catch(() => this._knownEcoStay())
        ]);
        const courses  = this.getCourses();

        const productLines = products
            .map(p => `  • ${p.name} (${p.category}) — $${p.price}/${p.unit}${p.stock ? ` | Stock: ${p.stock} ${p.unit}` : ''}`)
            .join('\n');

        const ecoLines = ecoStay
            .map(a => `  • ${a.name} (${a.type}) — $${a.pricePerNight}/night, sleeps ${a.capacity} — ${a.nextAvailable || 'Available'}`)
            .join('\n');

        const courseLines = courses
            .map(c => `  • ${c.title} (${c.level}, ${c.duration}${c.price ? `, $${c.price}` : ', Free'})`)
            .join('\n');

        return `
== GRASSGUM FARM — LIVE PRODUCT & MARKETING DATA ==

MARKETPLACE PRODUCTS (available now):
${productLines || '  (No product data available)'}

ECO-STAY / AGRITOURISM:
${ecoLines || '  (No eco-stay data available)'}

COURSES (onsite & online):
${courseLines || '  (No course data available)'}

FarmG8 services: Marketplace, Eco-Stay, Education, Carbon Credits, Biodiversity Credits
Farm brand: Grassgum Farm — regenerative agriculture, off-grid energy, agave spirits
Signature products: Grassgum Agave Spirit ($85/bottle), Sides of Beef/Lamb, fresh citrus
== END FARM DATA ==
`;
    }

    /**
     * Generate a platform-specific marketing post using live farm data.
     * Returns structured content for the AI to use.
     */
    async getContentBrief(platform, topic = null) {
        const [products, ecoStay] = await Promise.all([
            this.getAvailableProducts().catch(() => KNOWN_PRODUCTS),
            this.getEcoStay().catch(() => this._knownEcoStay())
        ]);
        const courses = this.getCourses();

        const featured = topic
            ? await this.findProduct(topic)
            : products[Math.floor(Math.random() * products.length)];

        return {
            platform,
            topic,
            featured,
            availableProducts: products.slice(0, 8),
            ecoStay: ecoStay.slice(0, 3),
            featuredCourse: courses.find(c => c.category === 'online') || courses[0],
            farmBrand: 'Grassgum Farm',
            tone: {
                instagram: 'visual, punchy, emoji-rich, #farm #agave #organic',
                facebook: 'friendly, community-focused, storytelling',
                linkedin: 'professional, sustainability-focused, B2B',
                whatsapp: 'conversational, helpful, direct'
            }[platform] || 'authentic, farm-focused'
        };
    }

    /**
     * Check if a product is available and return a quote.
     * Used by WhatsApp order flow.
     */
    async getProductQuote(productQuery, quantity = 1) {
        const product = await this.findProduct(productQuery);
        if (!product) {
            return {
                found: false,
                message: `Sorry, I couldn't find "${productQuery}" in our product list. Available products: ${KNOWN_PRODUCTS.slice(0,5).map(p => p.name).join(', ')}...`
            };
        }

        const total = (product.price * quantity).toFixed(2);
        const inStock = product.stock === null || product.stock >= quantity;

        return {
            found: true,
            product,
            quantity,
            unitPrice: product.price,
            total: parseFloat(total),
            inStock,
            message: inStock
                ? `Yes! **${product.name}** available — $${product.price}/${product.unit}. ${quantity} ${product.unit} = **$${total}**. Want to order?`
                : `Sorry, **${product.name}** is currently out of stock. I'll let you know when it's back!`
        };
    }

    /**
     * Check eco-stay availability for given dates.
     * Used by WhatsApp booking flow.
     */
    async checkEcoStayAvailability(checkIn, checkOut) {
        const stays = await this.getEcoStay();
        const checkInDate = new Date(checkIn);
        const checkOutDate = checkOut ? new Date(checkOut) : null;

        const available = stays.filter(s => {
            if (!s.bookedDates || !s.bookedDates.length) return true;
            return !s.bookedDates.some(b => {
                const bIn  = new Date(b.checkIn);
                const bOut = new Date(b.checkOut);
                return checkOutDate
                    ? !(checkOutDate <= bIn || checkInDate >= bOut)
                    : checkInDate >= bIn && checkInDate < bOut;
            });
        });

        return available;
    }

    /**
     * Invalidate all caches (call after check-in or booking events)
     */
    invalidateCache() {
        this._productCacheTs = 0;
        this._ecoStayCacheTs = 0;
    }
}

module.exports = FarmContent;
