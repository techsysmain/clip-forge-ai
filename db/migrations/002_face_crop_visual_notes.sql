ALTER TABLE clips DROP CHECK clips_crop_ck;
ALTER TABLE clips ADD CONSTRAINT clips_crop_ck CHECK (crop_mode IN ('center', 'blur', 'face'));
ALTER TABLE projects ADD COLUMN visual_notes JSON NULL AFTER transcript;
