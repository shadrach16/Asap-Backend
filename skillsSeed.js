const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Category = require('./models/Category');
const Skill = require('./models/Skill');

dotenv.config(); // Load .env variables

// --- Data based on the ASAP PRD ---
const categoriesData = [
    { name: 'Plumbing', description: 'All plumbing-related repairs and installations.' },
    { name: 'Electrical', description: 'Wiring, fixtures, and electrical system maintenance.' },
    { name: 'Carpentry', description: 'Framing, custom builds, and wood repairs.' },
    { name: 'General Contracting', description: 'Managing renovation projects, new builds, and additions.' },
    { name: 'Painting & Drywall', description: 'Interior/exterior painting and drywall repair.' },
    { name: 'HVAC', description: 'Heating, ventilation, and air conditioning services.' },
    { name: 'Landscaping', description: 'Outdoor design, maintenance, and hardscaping.' },
    { name: 'Roofing', description: 'Roof repairs, installation, and gutter maintenance.' },
];

const skillsData = {
    'Plumbing': [
        'Pipe Fitting', 'Drain Cleaning', 'Water Heater Installation', 'Fixture Repair', 'Sewer Line Inspection', 'Leak Detection'
    ],
    'Electrical': [
        'Residential Wiring', 'Light Fixture Installation', 'Circuit Breaker Repair', 'Outlet Installation', 'EV Charger Installation', 'Smart Home Setup'
    ],
    'Carpentry': [
        'Framing', 'Trim Work', 'Custom Cabinetry', 'Deck Building', 'Hardwood Flooring', 'Window & Door Installation'
    ],
    'General Contracting': [
        'Project Management', 'Renovations', 'Home Additions', 'Permit Pulling', 'Subcontractor Coordination', 'Budgeting'
    ],
    'Painting & Drywall': [
        'Interior Painting', 'Exterior Painting', 'Drywall Installation', 'Drywall Repair', 'Staining', 'Wallpaper Removal'
    ],
    'HVAC': [
        'Furnace Repair', 'Air Conditioning Installation', 'Ductwork Cleaning', 'Thermostat Installation', 'Ventilation', 'Boiler Maintenance'
    ],
    'Landscaping': [
        'Lawn Maintenance', 'Garden Design', 'Irrigation Systems', 'Paver Installation', 'Tree Removal', 'Fence Building'
    ],
    'Roofing': [
        'Shingle Roofing', 'Flat Roofing', 'Gutter Installation', 'Roof Repair', 'Siding Installation', 'Flashing Repair'
    ],
};
// --- End of Data ---

const seedDatabase = async () => {
    try {
        await mongoose.connect("mongodb+srv://Asap:Asap@cluster0.iyskkwb.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0");
        console.log('MongoDB connected for seeding...');

        // 1. Clear existing data
        console.log('Clearing old categories and skills...');
        await Category.deleteMany({});
        await Skill.deleteMany({});

        // 2. Create new categories
        console.log('Creating new categories...');
        
        // --- THIS IS THE FIX ---
        // We use Category.create() in a loop to ensure 'pre('save')' hook runs
        const createdCategories = [];
        for (const catData of categoriesData) {
            // Category.create() triggers the 'save' middleware
            const newCategory = await Category.create(catData); 
            createdCategories.push(newCategory);
        }
        // --- END OF FIX ---

        // 3. Map category names to their new _id
        const categoryIdMap = createdCategories.reduce((acc, cat) => {
            acc[cat.name] = cat._id;
            return acc;
        }, {});

        // 4. Prepare skills with category references
        let skillsToCreate = [];
        for (const categoryName in skillsData) {
            const categoryId = categoryIdMap[categoryName];
            if (categoryId) {
                const skillNames = skillsData[categoryName];
                const skills = skillNames.map(skillName => ({
                    name: skillName,
                    category: categoryId,
                    isVerified: true // Assume base skills are verified
                }));
                skillsToCreate = skillsToCreate.concat(skills);
            }
        }

        // 5. Create new skills
        console.log('Creating new skills...');
        // insertMany is fine here since Skill model has no 'pre('save')' logic
        await Skill.insertMany(skillsToCreate); 

        console.log('---------------------------------');
        console.log('Database seeded successfully!');
        console.log(`Created ${createdCategories.length} categories.`);
        console.log(`Created ${skillsToCreate.length} skills.`);
        console.log('---------------------------------');

    } catch (error) {
        console.error('Error seeding database:', error);
    } finally {
        // 6. Disconnect from DB
        await mongoose.disconnect();
        console.log('MongoDB disconnected.');
    }
};

// Run the seeder
seedDatabase();