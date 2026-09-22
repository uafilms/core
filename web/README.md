# 🎬 UAFilms - Frontend

UAFilms is a aggregator of movies and TV series that combines content from multiple sources (providers) and provides a convenient interface for searching and viewing.

> [!WARNING]  
> This project is currently in **Beta**. Some features may be unstable, and content availability depends on third-party sources.

---

## ✨ Features

* **Modern UI/UX**: Fully responsive design using Google's Material Design 3 system.
* **Dynamic Discovery**: Browse popular movies and series via a seamless home interface.
* **Advanced Search**: Quickly find content using a dedicated search page.
* **Favorites System**: Save your preferred content for quick access later.
* **Detailed Information**: Deep insights into every title, including metadata and streaming options.
* **Personalization**: Theme switching support (Dark/Light modes) stored locally.
* **Security Integration**: Built-in support for Cloudflare Turnstile to protect against bots.
* **Optimized Performance**:
* Lazy loading for routes to reduce initial bundle size.
* Top-loading progress bar for better visual feedback during API calls.



---

## 🛠 Tech Stack

### Core

* **Framework**: [React 18](https://reactjs.org/)
* **Build Tool**: [Vite](https://vitejs.dev/)
* **Routing**: [React Router DOM v6](https://reactrouter.com/)

### UI Components

* **Web Components**: [mdui](https://mdui.org) for Material Design 3 components (migrated from @material/web).
* **Icons**: Material Symbols.
* **Sliders**: Swiper.js for interactive carousels.

### Utilities

* **HTTP Client**: Axios with interceptors for global loading events.
* **Loading Bar**: React Top Loading Bar.
* **Archiving**: JSZip and FileSaver for content management.

---

## 🚀 Getting Started

### Prerequisites

* **Node.js**: v18.x or higher
* **npm** or **yarn**

### Installation

1. **Clone the repository**:
```bash
git clone https://github.com/your-username/uafilms-frontend.git
cd uafilms-frontend

```


2. **Install dependencies**:
```bash
npm install

```


3. **Environment Setup**:
Create a `.env` file in the root directory. You can use `.env.example` as a template:
```bash
cp .env.example .env

```


Update the values in `.env`:
* `VITE_API_BASE_URL`: The URL of your running backend API.




### Development

Start the development server with Hot Module Replacement (HMR):

```bash
npm run dev

```

### Production Build

To build the project for production:

```bash
npm run build

```

The output will be generated in the `dist/` directory, optimized and ready for deployment.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](https://www.google.com/search?q=LICENSE) file for details.