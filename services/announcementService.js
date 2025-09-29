const { getDb } = require('../database');

class AnnouncementService {
  constructor() {
    this.db = getDb();
  }

  // Create new announcement
  createAnnouncement(title, content, createdBy) {
    try {
      // Deactivate all previous announcements
      this.db.prepare('UPDATE announcements SET is_active = 0').run();
      
      // Create new active announcement
      const stmt = this.db.prepare(`
        INSERT INTO announcements (title, content, created_by, is_active)
        VALUES (?, ?, ?, 1)
      `);
      
      const result = stmt.run(title, content, createdBy);
      return result.lastInsertRowid;
    } catch (error) {
      console.error('Error creating announcement:', error);
      throw error;
    }
  }

  // Get active announcement
  getActiveAnnouncement() {
    try {
      const announcement = this.db.prepare(`
        SELECT a.*, u.username as created_by_username 
        FROM announcements a 
        LEFT JOIN users u ON a.created_by = u._id 
        WHERE a.is_active = 1 
        ORDER BY a.created_at DESC 
        LIMIT 1
      `).get();
      
      return announcement || null;
    } catch (error) {
      console.error('Error getting active announcement:', error);
      return null;
    }
  }

  // Mark announcement as viewed by user
  markAsViewed(userId, announcementId) {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO user_announcement_views (user_id, announcement_id, viewed_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `);
      
      stmt.run(userId, announcementId);
      return true;
    } catch (error) {
      console.error('Error marking announcement as viewed:', error);
      return false;
    }
  }

  // Check if user has seen the current announcement
  hasUserSeenAnnouncement(userId, announcementId) {
    try {
      const view = this.db.prepare(`
        SELECT * FROM user_announcement_views 
        WHERE user_id = ? AND announcement_id = ?
      `).get(userId, announcementId);
      
      return !!view;
    } catch (error) {
      console.error('Error checking announcement view:', error);
      return false;
    }
  }

  // Get announcement history
  getAnnouncementHistory(limit = 10) {
    try {
      const announcements = this.db.prepare(`
        SELECT a.*, u.username as created_by_username,
               (SELECT COUNT(*) FROM user_announcement_views uav WHERE uav.announcement_id = a._id) as view_count
        FROM announcements a
        LEFT JOIN users u ON a.created_by = u._id
        ORDER BY a.created_at DESC
        LIMIT ?
      `).all(limit);
      
      return announcements;
    } catch (error) {
      console.error('Error getting announcement history:', error);
      return [];
    }
  }

  // Get announcement statistics
  getAnnouncementStats(announcementId) {
    try {
      const stats = this.db.prepare(`
        SELECT 
          COUNT(DISTINCT uav.user_id) as unique_views,
          (SELECT COUNT(*) FROM users WHERE is_verified = 1) as total_users,
          a.created_at,
          u.username as created_by
        FROM announcements a
        LEFT JOIN user_announcement_views uav ON a._id = uav.announcement_id
        LEFT JOIN users u ON a.created_by = u._id
        WHERE a._id = ?
        GROUP BY a._id
      `).get(announcementId);
      
      return stats || { unique_views: 0, total_users: 0 };
    } catch (error) {
      console.error('Error getting announcement stats:', error);
      return { unique_views: 0, total_users: 0 };
    }
  }
}

module.exports = new AnnouncementService();