# Changelog

## [Fixed] - 2026-04-16

### Fixed
- **Database Error**: Fixed `tuple indices must be integers or slices, not str` error in `init_db_tables()` function
  - Changed cursor initialization to use `RealDictCursor` for proper dictionary access
  - Affected file: `main.py` line 82

### Added
- **Supabase Storage Support**: Added support for permanent image storage
  - Added `supabase` dependency to `requirements.txt`
  - Added Supabase configuration variables to `.env.example`
  - Created migration script `fix_storage.py` for existing images
  - Created test script `test_fixes.py` for validation

### Changed
- **requirements.txt**: Added `supabase==2.10.0`
- **.env.example**: Added Supabase Storage configuration
- **.gitignore**: Added `static/` folder to prevent committing local images

### Documentation
- **START_HERE_AR.md**: Quick start guide in Arabic
- **README_AR.md**: Complete guide in Arabic
- **QUICK_FIX_GUIDE.md**: Step-by-step fix guide
- **FIXES_SUMMARY_AR.md**: Detailed summary in Arabic
- **STORAGE_SOLUTION.md**: Image storage solution details
- **SUMMARY.md**: English summary
- **CHANGELOG.md**: This file

### Scripts
- **fix_storage.py**: Migrate images from local to Supabase Storage
- **test_fixes.py**: Test all fixes and configurations
- **update_upload_function.py**: Updated upload function code

---

## Migration Guide

### For Existing Projects

1. **Update dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Test database fix:**
   ```bash
   uvicorn main:app --reload
   ```
   Should see: `✅ PostgreSQL tables ready (Supabase)`

3. **Setup Supabase Storage (Optional but Recommended):**
   - Create bucket in Supabase: `app-images` (Public)
   - Add to `.env`:
     ```env
     SUPABASE_URL=https://xxxxx.supabase.co
     SUPABASE_KEY=your_key
     SUPABASE_BUCKET=app-images
     ```
   - Update upload function (see `update_upload_function.py`)
   - Migrate existing images: `python fix_storage.py`

---

## Breaking Changes

None. All changes are backward compatible.

---

## Notes

- Database fix is automatic and requires no action
- Image storage fix is optional for development but recommended for production
- Existing images in `static/` folder will continue to work locally
- For production deployment, Supabase Storage is strongly recommended

---

## Support

For issues or questions:
1. Check `START_HERE_AR.md` for quick start
2. Review `README_AR.md` for detailed guide
3. Run `python test_fixes.py` for diagnostics
