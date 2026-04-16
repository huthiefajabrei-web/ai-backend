# AI Architecture Backend

Backend API for AI-powered architectural visualization platform.

## 🎯 Recent Fixes (April 16, 2026)

### ✅ Fixed Issues
1. **Database Error**: `tuple indices must be integers or slices, not str` - Fixed automatically
2. **Image Storage**: Images disappearing on code updates - Solution provided

### 📚 Documentation
- 🇸🇦 **[START_HERE_AR.md](START_HERE_AR.md)** - ابدأ من هنا (Arabic Quick Start)
- 📖 **[INDEX.md](INDEX.md)** - Complete documentation index
- 🚀 **[QUICK_FIX_GUIDE.md](QUICK_FIX_GUIDE.md)** - Quick fix guide

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Configure Environment
Copy `.env.example` to `.env` and fill in your values:
```bash
cp .env.example .env
```

Required variables:
- `DATABASE_URL` - PostgreSQL connection string (Supabase)
- `RUNPOD_API_KEY` - RunPod API key
- `GEMINI_API_KEY` - Google Gemini API key
- `KLING_API_KEY` - Kling AI API key

Optional (recommended for production):
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_KEY` - Supabase anon key
- `SUPABASE_BUCKET` - Storage bucket name (default: `app-images`)

### 3. Run Server
```bash
uvicorn main:app --reload
```

Server will start at: http://127.0.0.1:8000

---

## 📋 Features

- **Authentication**: User registration, login, and session management
- **AI Image Generation**: Generate architectural visualizations using RunPod
- **Image to Video**: Convert static images to videos using Kling AI
- **Content Management**: Admin panel for managing tools, apps, plans, and prompts
- **Session Management**: Save and manage user generation sessions
- **Supabase Integration**: PostgreSQL database and optional cloud storage

---

## 🗂️ Project Structure

```
ai-backend/
├── main.py                 # Main FastAPI application
├── requirements.txt        # Python dependencies
├── .env.example           # Environment variables template
├── static/                # Local static files (images)
├── supabase/
│   └── schema.sql         # Database schema
└── docs/
    ├── START_HERE_AR.md   # Arabic quick start
    ├── README_AR.md       # Complete Arabic guide
    ├── QUICK_FIX_GUIDE.md # Quick fix guide
    └── INDEX.md           # Documentation index
```

---

## 🔧 API Endpoints

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login user
- `POST /auth/logout` - Logout user
- `GET /auth/me` - Get current user

### Sessions
- `GET /sessions` - Get user sessions
- `POST /sessions` - Create new session
- `PATCH /sessions/{id}` - Update session
- `DELETE /sessions/{id}` - Delete session

### Content (Public)
- `GET /content/tools` - Get tools
- `GET /content/apps` - Get apps
- `GET /content/plans` - Get pricing plans
- `GET /content/hero` - Get hero images
- `GET /content/prompts` - Get AI prompts

### Admin (Requires Admin Access)
- `GET /admin/stats` - Get statistics
- `POST /content/{type}` - Create/update content
- `DELETE /content/{type}/{id}` - Delete content
- `POST /admin/upload-image` - Upload image

### AI Generation
- `POST /generate` - Generate AI images
- `POST /video` - Generate video from image
- `GET /status/{job_id}` - Check generation status

---

## 🧪 Testing

### Test Database Fix
```bash
python test_fixes.py
```

Expected output:
```
✅ قاعدة البيانات تعمل بشكل صحيح
```

### Test Server
```bash
uvicorn main:app --reload
```

Expected output:
```
✅ PostgreSQL tables ready (Supabase)
✅ Supabase Storage connected (if configured)
```

---

## 📦 Dependencies

- **FastAPI** - Modern web framework
- **Uvicorn** - ASGI server
- **psycopg2-binary** - PostgreSQL adapter
- **python-dotenv** - Environment variables
- **requests** - HTTP library
- **pydantic** - Data validation
- **supabase** - Supabase client (optional)

---

## 🔐 Security

- Password hashing using SHA-256
- Token-based authentication (30-day expiry)
- Admin-only endpoints protected
- Row Level Security (RLS) in Supabase
- Environment variables for sensitive data

---

## 🌐 Deployment

### Local Development
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Production
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

**Important for Production:**
1. Set up Supabase Storage (see [STORAGE_SOLUTION.md](STORAGE_SOLUTION.md))
2. Configure all environment variables
3. Use HTTPS
4. Set proper CORS origins
5. Enable rate limiting

---

## 📚 Documentation

### For Users
- **[START_HERE_AR.md](START_HERE_AR.md)** - Quick start in Arabic
- **[QUICK_FIX_GUIDE.md](QUICK_FIX_GUIDE.md)** - Step-by-step fix guide
- **[INDEX.md](INDEX.md)** - Complete documentation index

### For Developers
- **[README_AR.md](README_AR.md)** - Complete guide in Arabic
- **[STORAGE_SOLUTION.md](STORAGE_SOLUTION.md)** - Image storage solution
- **[CHANGELOG.md](CHANGELOG.md)** - Change log

---

## 🐛 Troubleshooting

### Database Error
If you see `tuple indices must be integers or slices, not str`:
- ✅ This has been fixed in the latest version
- Update your code and restart the server

### Images Disappearing
If images disappear after code updates:
- See [STORAGE_SOLUTION.md](STORAGE_SOLUTION.md) for the solution
- Run `python fix_storage.py` to migrate existing images

### Connection Issues
- Check `.env` file has all required variables
- Verify DATABASE_URL is correct
- Test connection: `python test_fixes.py`

---

## 📞 Support

For issues or questions:
1. Check [INDEX.md](INDEX.md) for relevant documentation
2. Run `python test_fixes.py` for diagnostics
3. Review error logs in terminal

---

## 📄 License

[Your License Here]

---

## 🙏 Acknowledgments

- FastAPI for the excellent web framework
- Supabase for database and storage
- RunPod for AI infrastructure
- Kling AI for video generation

---

**Built with ❤️ using FastAPI and Supabase**

**Last Updated:** April 16, 2026
