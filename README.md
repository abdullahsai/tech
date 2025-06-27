# Roads Webapp

This is a simple Node.js/Express web application with an SQLite database for managing items. The database file lives at `data/data.db` so it can be mounted as a persistent volume. The interface is now in Arabic and uses a right-to-left layout. Each item consists of:

- **Category**
- **Description**
- **Unit of measurement**
- **Cost per unit**

The main page allows you to add items and shows the last five entries. A second page at `/report` lets you build damage reports. At the top of each report you can enter the supervisor name, police report number, street, state, and a short location description. Choose a category, enter quantities for items and press **Add Items** to build up your report. When finished, click **Save Report** to store it or **Discard Report** to clear the form. Each saved report shows the total cost of its items. Use the **Download PDF** button to export a nicely formatted report with your header information and an itemized table.

An extra admin interface is available at `/admin` where you can upload a plain text file to import many items at once. Each line of the file should contain `category:description:unit:cost` from left to right.

Saved reports keep a snapshot of every item's description, unit and cost. Editing or deleting items later will not alter the information shown in previous reports.

The repository includes placeholder files at `public/amiri.ttf`, `public/logo.png` and `public/sig.png`. Before exporting PDFs, download the real Amiri font from the [official releases](https://github.com/aliftype/amiri/releases), place your 333 × 333 PNG logo at `public/logo.png`, and replace `public/sig.png` with your signature image. The signature will appear centered at the bottom of generated reports with the text "المشرف / المهندس" above a thick line.

## Development

1. Install dependencies:
   ```bash
   npm install
   ```
   Node.js 18 or newer is recommended.
2. Start the development server:
   ```bash
   npm start
   ```
   The app will run on `http://localhost:3000`.

## Docker

Build and run using Docker:
```bash
docker build -t roads-app .
docker run -p 3000:3000 roads-app
```

## Deploying with CapRover

1. Push this repository to your GitHub account.
2. From your CapRover dashboard, create a new app.
3. In the app settings, enable deployment via Git and follow the instructions to connect the repository.
4. Deploy the app; CapRover will build the Dockerfile and run the container.
5. Mount a persistent volume at `/app/data` so the `data/data.db` database survives restarts.

For more details, see the [CapRover documentation](https://caprover.com/docs/complete-webapp-tutorial.html).
