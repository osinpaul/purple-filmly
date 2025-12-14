const express = require('express');
const jwt = require('jsonwebtoken');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_PREFIX = '/api/v1';
const JWT_SECRET = process.env.JWT_SECRET || 'purple-wallet-dev-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || 3600; // seconds

const GENRES = [
  { id: 0, name: 'Все', slug: 'all' },
  { id: 1, name: 'Мелодрама', slug: 'melodrama' },
  { id: 2, name: 'Фантастика', slug: 'fantasy' },
  { id: 3, name: 'Боевик', slug: 'action' },
  { id: 4, name: 'Триллер', slug: 'thriller' },
  { id: 5, name: 'Детектив', slug: 'detective' },
];

const MOVIES = [
  {
    id: 'm_002',
    title: 'Interstellar',
    releaseYear: 2014,
    genreIds: [2, 4],
    rating: 4.8,
    posterUrl:
      'https://upload.wikimedia.org/wikipedia/en/b/bc/Interstellar_film_poster.jpg',
    isFavorite: true,
    description: 'Экспедиция за пределы привычного мира ради будущего человечества.',
    durationMin: 169,
  },
  {
    id: 'm_004',
    title: 'Mad Max: Fury Road',
    releaseYear: 2015,
    genreIds: [3, 4],
    rating: 4.3,
    posterUrl:
      'https://upload.wikimedia.org/wikipedia/en/6/6e/Mad_Max_Fury_Road.jpg',
    isFavorite: false,
    description: 'Дорога ярости, топливо и борьба за свободу.',
    durationMin: 120,
  },
  {
    id: 'm_005',
    title: 'The Notebook',
    releaseYear: 2004,
    genreIds: [1],
    rating: 4.2,
    posterUrl:
      'https://upload.wikimedia.org/wikipedia/en/8/86/Posternotebook.jpg',
    isFavorite: false,
    description: 'История любви, рассказанная сквозь годы.',
    durationMin: 124,
  },
  {
    id: 'm_006',
    title: 'Inception',
    releaseYear: 2010,
    genreIds: [3, 2, 4],
    rating: 4.6,
    posterUrl:
      'https://upload.wikimedia.org/wikipedia/en/2/2e/Inception_%282010%29_theatrical_poster.jpg',
    isFavorite: false,
    description: 'Во сне внутри сна, где реальность под вопросом.',
    durationMin: 148,
  },
];

const favorites = new Set(MOVIES.filter(movie => movie.isFavorite).map(movie => movie.id));
const tokenBlacklist = new Set(); // Хранит отозванные токены при логауте

app.use(express.json());

const swaggerDocument = YAML.load(path.join(__dirname, 'openapi.yaml'));

const normalizeEmail = value =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const isValidEmail = email =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));

const isValidPassword = password =>
  typeof password === 'string' && password.trim().length > 0;

const sendError = (res, status, code, message, details) => {
  const payload = { code, message };
  if (details) {
    payload.details = details;
  }
  return res.status(status).json(payload);
};

const getExpiresInSeconds = value => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return numeric;
    const match = value.match(/^(\d+(?:\.\d+)?)([smhd])$/i);
    if (!match) return 3600;
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[unit];
    return Math.round(amount * multiplier);
  }
  return 3600;
};

const authenticateRequest = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Authorization header is missing or invalid');
  }

  if (tokenBlacklist.has(token)) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Token has been revoked');
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    req.token = token;
    next();
  } catch {
    sendError(res, 401, 'UNAUTHORIZED', 'Invalid or expired token');
  }
};

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

router.post('/auth', (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = normalizeEmail(email);

  console.log(`Authentication attempt for email: ${normalizedEmail}, password: ${password}`);

  if (!isValidEmail(normalizedEmail) || !isValidPassword(password)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Email или пароль указаны неверно');
  }

  const token = jwt.sign({ email: normalizedEmail }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

  res.json({
    accessToken: token,
    tokenType: 'Bearer',
    expiresIn: getExpiresInSeconds(JWT_EXPIRES_IN),
  });
});

router.use(authenticateRequest);

router.post('/logout', (req, res) => {
  if (req.token) {
    tokenBlacklist.add(req.token);
  }
  res.json({ message: 'Successfully logged out' });
});

router.get('/genres', (_req, res) => {
  res.json(GENRES);
});

const hasGenre = (movieGenres, requestedIds) =>
  requestedIds.some(requestedId => movieGenres.includes(requestedId));

const parseIds = ids => {
  if (!ids) return null;
  const list = Array.isArray(ids) ? ids : [ids];
  const parsed = list
    .map(value => Number(value))
    .filter(value => Number.isInteger(value));
  return parsed.length ? parsed : null;
};

const parseYear = value => {
  if (!value) return null;
  const year = Number(value);
  return Number.isInteger(year) && year > 0 ? year : null;
};

const sortMovies = (movies, sortKey) => {
  if (!sortKey) return movies;
  const clone = [...movies];
  if (sortKey === 'rating') {
    clone.sort((a, b) => b.rating - a.rating);
  } else if (sortKey === 'name') {
    clone.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sortKey === 'genre') {
    clone.sort((a, b) => {
      const aGenre = a.genreIds[0] ?? 0;
      const bGenre = b.genreIds[0] ?? 0;
      return aGenre - bGenre;
    });
  }
  return clone;
};

router.get('/movies', (req, res) => {
  const genreIds = parseIds(req.query.id);
  const fromYear = parseYear(req.query.from);
  const toYear = parseYear(req.query.to);
  const sortKey = req.query.sort;

  if (req.query.id && !genreIds) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Некорректные id жанров');
  }

  if (req.query.from && !fromYear) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Некорректный год "from"');
  }

  if (req.query.to && !toYear) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Некорректный год "to"');
  }

  if (sortKey && !['rating', 'name', 'genre'].includes(sortKey)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Некорректный параметр сортировки');
  }

  const filtered = MOVIES.filter(movie => {
    if (genreIds && !hasGenre(movie.genreIds, genreIds)) {
      return false;
    }
    if (fromYear && movie.releaseYear < fromYear) {
      return false;
    }
    if (toYear && movie.releaseYear > toYear) {
      return false;
    }
    return true;
  });

  const sorted = sortMovies(filtered, sortKey);
  const withFavorites = sorted.map(movie => ({
    ...movie,
    isFavorite: favorites.has(movie.id),
  }));

  res.json({
    items: withFavorites,
    total: withFavorites.length,
  });
});

router.get('/favorites', (req, res) => {
  const genreIds = parseIds(req.query.id);
  const fromYear = parseYear(req.query.from);
  const toYear = parseYear(req.query.to);
  const sortKey = req.query.sort;

  if (req.query.id && !genreIds) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Некорректные id жанров');
  }

  if (req.query.from && !fromYear) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Некорректный год "from"');
  }

  if (req.query.to && !toYear) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Некорректный год "to"');
  }

  if (sortKey && !['rating', 'name', 'genre'].includes(sortKey)) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Некорректный параметр сортировки');
  }

  const filtered = MOVIES.filter(movie => {
    if (!favorites.has(movie.id)) {
      return false;
    }
    if (genreIds && !hasGenre(movie.genreIds, genreIds)) {
      return false;
    }
    if (fromYear && movie.releaseYear < fromYear) {
      return false;
    }
    if (toYear && movie.releaseYear > toYear) {
      return false;
    }
    return true;
  });

  const sorted = sortMovies(filtered, sortKey);
  const withFavorites = sorted.map(movie => ({
    ...movie,
    isFavorite: true,
  }));

  res.json({ items: withFavorites });
});

router.patch('/favorites', (req, res) => {
  const { movieId } = req.body || {};

  if (typeof movieId !== 'string' || !movieId.trim()) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'movieId обязателен');
  }

  const movie = MOVIES.find(item => item.id === movieId);

  if (!movie) {
    return sendError(res, 404, 'NOT_FOUND', 'Фильм не найден');
  }

  if (favorites.has(movieId)) {
    return sendError(res, 409, 'CONFLICT', 'Фильм уже в избранном');
  }

  favorites.add(movieId);
  const favoriteMovies = MOVIES.filter(item => favorites.has(item.id)).map(item => ({
    ...item,
    isFavorite: true,
  }));

  res.json({ items: favoriteMovies });
});

router.delete('/favorites', (req, res) => {
  const { movieId } = req.body || {};

  if (typeof movieId !== 'string' || !movieId.trim()) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'movieId обязателен');
  }

  if (!favorites.has(movieId)) {
    return sendError(res, 404, 'NOT_FOUND', 'Фильм не найден в избранном');
  }

  favorites.delete(movieId);

  const favoriteMovies = MOVIES.filter(item => favorites.has(item.id)).map(item => ({
    ...item,
    isFavorite: true,
  }));

  res.json({ items: favoriteMovies });
});

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use(API_PREFIX, router);

app.use((_req, res) => {
  sendError(res, 404, 'NOT_FOUND', 'Route not found');
});

app.listen(PORT, () => {
  console.log(`Filmly API is running on port ${PORT}`);
});

module.exports = app;
