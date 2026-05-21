using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using Jellyfin.Plugin.StarRating.Models;
using MediaBrowser.Common.Configuration;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.StarRating.Services;

public class RatingService
{
    private const int CurrentSchemaVersion = 2;

    private readonly string _dbPath;
    private readonly ILogger<RatingService> _logger;
    private readonly object _writeLock = new();

    public RatingService(IApplicationPaths appPaths, ILogger<RatingService> logger)
    {
        _dbPath = Path.Combine(appPaths.DataPath, "starrating.db");
        _logger = logger;
        InitializeDatabase();
    }

    // ── Connexion ─────────────────────────────────────────────────────────────

    private SqliteConnection OpenConnection()
    {
        var connection = new SqliteConnection($"Data Source={_dbPath};Cache=Shared");
        connection.Open();
        ConfigurePragmas(connection);
        return connection;
    }

    private static void ConfigurePragmas(SqliteConnection connection)
    {
        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA busy_timeout = 5000;
            PRAGMA foreign_keys = ON;
        ";
        cmd.ExecuteNonQuery();
    }

    private void InitializeDatabase()
    {
        lock (_writeLock)
        {
            using var connection = OpenConnection();

            using (var schema = connection.CreateCommand())
            {
                schema.CommandText = @"
                    CREATE TABLE IF NOT EXISTS SchemaInfo (
                        Key   TEXT PRIMARY KEY,
                        Value TEXT NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS Ratings (
                        Id        INTEGER PRIMARY KEY AUTOINCREMENT,
                        UserId    TEXT NOT NULL,
                        ItemId    TEXT NOT NULL,
                        Rating    REAL NOT NULL CHECK(Rating >= 0.5 AND Rating <= 5.0),
                        CreatedAt TEXT NOT NULL,
                        UpdatedAt TEXT NOT NULL,
                        UNIQUE(UserId, ItemId)
                    );

                    CREATE TABLE IF NOT EXISTS Reviews (
                        Id         INTEGER PRIMARY KEY AUTOINCREMENT,
                        UserId     TEXT NOT NULL,
                        UserName   TEXT NOT NULL,
                        ItemId     TEXT NOT NULL,
                        ReviewText TEXT NOT NULL,
                        CreatedAt  TEXT NOT NULL,
                        UpdatedAt  TEXT NOT NULL,
                        UNIQUE(UserId, ItemId)
                    );

                    CREATE INDEX IF NOT EXISTS idx_ratings_itemid ON Ratings(ItemId);
                    CREATE INDEX IF NOT EXISTS idx_reviews_itemid ON Reviews(ItemId);
                    CREATE INDEX IF NOT EXISTS idx_ratings_userid ON Ratings(UserId);
                    CREATE INDEX IF NOT EXISTS idx_reviews_userid ON Reviews(UserId);
                ";
                schema.ExecuteNonQuery();
            }

            ApplyMigrations(connection);

            _logger.LogInformation(
                "StarRating database initialized at {Path} (schema v{Version})",
                _dbPath,
                CurrentSchemaVersion);
        }
    }

    private void ApplyMigrations(SqliteConnection connection)
    {
        var currentVersion = 0;

        using (var read = connection.CreateCommand())
        {
            read.CommandText = "SELECT Value FROM SchemaInfo WHERE Key = 'version'";
            var raw = read.ExecuteScalar();
            if (raw is string s && int.TryParse(s, out var parsed))
            {
                currentVersion = parsed;
            }
        }

        if (currentVersion >= CurrentSchemaVersion)
        {
            return;
        }

        using var tx = connection.BeginTransaction();

        if (currentVersion < 2)
        {
            // Normalise tous les identifiants pour qu'on puisse les comparer sans tirets ni casse.
            using var normalize = connection.CreateCommand();
            normalize.Transaction = tx;
            normalize.CommandText = @"
                UPDATE Ratings SET UserId = LOWER(REPLACE(UserId, '-', '')), ItemId = LOWER(REPLACE(ItemId, '-', ''));
                UPDATE Reviews SET UserId = LOWER(REPLACE(UserId, '-', '')), ItemId = LOWER(REPLACE(ItemId, '-', ''));
            ";
            normalize.ExecuteNonQuery();
        }

        using (var write = connection.CreateCommand())
        {
            write.Transaction = tx;
            write.CommandText = @"
                INSERT INTO SchemaInfo (Key, Value) VALUES ('version', $version)
                ON CONFLICT(Key) DO UPDATE SET Value = $version;
            ";
            write.Parameters.AddWithValue("$version", CurrentSchemaVersion.ToString(CultureInfo.InvariantCulture));
            write.ExecuteNonQuery();
        }

        tx.Commit();
    }

    // ── Helpers internes ──────────────────────────────────────────────────────

    private static string Norm(Guid value) => value.ToString("N", CultureInfo.InvariantCulture);

    private static string NowIso() => DateTime.UtcNow.ToString("O", CultureInfo.InvariantCulture);

    private static DateTime ParseIso(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return DateTime.UtcNow;
        }

        if (DateTime.TryParse(
                value,
                CultureInfo.InvariantCulture,
                DateTimeStyles.RoundtripKind,
                out var parsed))
        {
            if (parsed.Kind == DateTimeKind.Unspecified)
            {
                return DateTime.SpecifyKind(parsed, DateTimeKind.Utc);
            }

            return parsed.ToUniversalTime();
        }

        return DateTime.UtcNow;
    }

    private static Guid ParseGuid(string raw)
    {
        if (Guid.TryParse(raw, out var parsed))
        {
            return parsed;
        }

        return Guid.Empty;
    }

    private static double NormalizeRating(double rating)
    {
        if (rating < 0.5)
        {
            return 0.5;
        }

        if (rating > 5.0)
        {
            return 5.0;
        }

        return Math.Round(rating * 2, MidpointRounding.AwayFromZero) / 2.0;
    }

    // ── Ratings ───────────────────────────────────────────────────────────────

    public void SetRating(Guid userId, Guid itemId, double rating)
    {
        var normalized = NormalizeRating(rating);

        lock (_writeLock)
        {
            using var connection = OpenConnection();
            using var cmd = connection.CreateCommand();
            cmd.CommandText = @"
                INSERT INTO Ratings (UserId, ItemId, Rating, CreatedAt, UpdatedAt)
                VALUES ($userId, $itemId, $rating, $now, $now)
                ON CONFLICT(UserId, ItemId) DO UPDATE SET
                    Rating    = $rating,
                    UpdatedAt = $now";
            cmd.Parameters.AddWithValue("$userId", Norm(userId));
            cmd.Parameters.AddWithValue("$itemId", Norm(itemId));
            cmd.Parameters.AddWithValue("$rating", normalized);
            cmd.Parameters.AddWithValue("$now", NowIso());
            cmd.ExecuteNonQuery();
        }
    }

    public bool DeleteRating(Guid userId, Guid itemId)
    {
        lock (_writeLock)
        {
            using var connection = OpenConnection();
            using var transaction = connection.BeginTransaction();

            int removed;
            using (var cmd = connection.CreateCommand())
            {
                cmd.Transaction = transaction;
                cmd.CommandText = @"
                    DELETE FROM Ratings WHERE UserId = $userId AND ItemId = $itemId;
                    DELETE FROM Reviews WHERE UserId = $userId AND ItemId = $itemId;
                ";
                cmd.Parameters.AddWithValue("$userId", Norm(userId));
                cmd.Parameters.AddWithValue("$itemId", Norm(itemId));
                removed = cmd.ExecuteNonQuery();
            }

            transaction.Commit();
            return removed > 0;
        }
    }

    public UserRating? GetUserRating(Guid userId, Guid itemId)
    {
        using var connection = OpenConnection();
        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            SELECT Id, UserId, ItemId, Rating, CreatedAt, UpdatedAt
            FROM Ratings
            WHERE UserId = $userId AND ItemId = $itemId";
        cmd.Parameters.AddWithValue("$userId", Norm(userId));
        cmd.Parameters.AddWithValue("$itemId", Norm(itemId));

        using var reader = cmd.ExecuteReader();
        if (!reader.Read())
        {
            return null;
        }

        return new UserRating
        {
            Id        = reader.GetInt64(0),
            UserId    = ParseGuid(reader.GetString(1)),
            ItemId    = ParseGuid(reader.GetString(2)),
            Rating    = reader.GetDouble(3),
            CreatedAt = ParseIso(reader.GetString(4)),
            UpdatedAt = ParseIso(reader.GetString(5))
        };
    }

    public IEnumerable<MyRatingDto> GetUserRatings(Guid userId)
    {
        using var connection = OpenConnection();
        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            SELECT ItemId, Rating, CreatedAt, UpdatedAt
            FROM Ratings
            WHERE UserId = $userId
            ORDER BY UpdatedAt DESC";
        cmd.Parameters.AddWithValue("$userId", Norm(userId));

        var results = new List<MyRatingDto>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            results.Add(new MyRatingDto
            {
                ItemId    = ParseGuid(reader.GetString(0)),
                Rating    = reader.GetDouble(1),
                CreatedAt = ParseIso(reader.GetString(2)),
                UpdatedAt = ParseIso(reader.GetString(3))
            });
        }

        return results;
    }

    public IEnumerable<BatchMyRatingsResponseItem> GetUserRatingsForItems(Guid userId, IEnumerable<Guid> itemIds)
    {
        var distinct = itemIds.Distinct().Where(id => id != Guid.Empty).ToList();
        if (distinct.Count == 0)
        {
            return Array.Empty<BatchMyRatingsResponseItem>();
        }

        using var connection = OpenConnection();
        using var cmd = connection.CreateCommand();

        var placeholders = new List<string>(distinct.Count);
        for (var i = 0; i < distinct.Count; i++)
        {
            var paramName = "$id" + i.ToString(CultureInfo.InvariantCulture);
            placeholders.Add(paramName);
            cmd.Parameters.AddWithValue(paramName, Norm(distinct[i]));
        }

        cmd.Parameters.AddWithValue("$userId", Norm(userId));
        cmd.CommandText = $@"
            SELECT ItemId, Rating
            FROM Ratings
            WHERE UserId = $userId AND ItemId IN ({string.Join(",", placeholders)})";

        var results = new List<BatchMyRatingsResponseItem>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            results.Add(new BatchMyRatingsResponseItem
            {
                ItemId = ParseGuid(reader.GetString(0)),
                Rating = reader.GetDouble(1)
            });
        }

        return results;
    }

    public RatingSummaryDto GetRatingSummary(Guid itemId)
    {
        using var connection = OpenConnection();
        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            SELECT AVG(CAST(Rating AS REAL)), COUNT(*)
            FROM Ratings
            WHERE ItemId = $itemId";
        cmd.Parameters.AddWithValue("$itemId", Norm(itemId));

        using var reader = cmd.ExecuteReader();
        if (reader.Read() && !reader.IsDBNull(0))
        {
            return new RatingSummaryDto
            {
                AverageRating = Math.Round(reader.GetDouble(0), 1),
                TotalRatings  = reader.GetInt32(1)
            };
        }

        return new RatingSummaryDto { AverageRating = 0, TotalRatings = 0 };
    }

    public IEnumerable<BatchSummaryResponseItem> GetRatingSummaries(IEnumerable<Guid> itemIds)
    {
        var distinct = itemIds.Distinct().Where(id => id != Guid.Empty).ToList();
        if (distinct.Count == 0)
        {
            return Array.Empty<BatchSummaryResponseItem>();
        }

        using var connection = OpenConnection();
        using var cmd = connection.CreateCommand();

        var placeholders = new List<string>(distinct.Count);
        for (var i = 0; i < distinct.Count; i++)
        {
            var paramName = "$id" + i.ToString(CultureInfo.InvariantCulture);
            placeholders.Add(paramName);
            cmd.Parameters.AddWithValue(paramName, Norm(distinct[i]));
        }

        cmd.CommandText = $@"
            SELECT ItemId, AVG(CAST(Rating AS REAL)) AS Avg, COUNT(*) AS Total
            FROM Ratings
            WHERE ItemId IN ({string.Join(",", placeholders)})
            GROUP BY ItemId";

        var results = new List<BatchSummaryResponseItem>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            results.Add(new BatchSummaryResponseItem
            {
                ItemId        = ParseGuid(reader.GetString(0)),
                AverageRating = reader.IsDBNull(1) ? 0 : Math.Round(reader.GetDouble(1), 1),
                TotalRatings  = reader.GetInt32(2)
            });
        }

        return results;
    }

    // ── Reviews ───────────────────────────────────────────────────────────────

    public void AddReview(Guid userId, string userName, Guid itemId, string reviewText)
    {
        lock (_writeLock)
        {
            using var connection = OpenConnection();
            using var cmd = connection.CreateCommand();
            cmd.CommandText = @"
                INSERT INTO Reviews (UserId, UserName, ItemId, ReviewText, CreatedAt, UpdatedAt)
                VALUES ($userId, $userName, $itemId, $reviewText, $now, $now)
                ON CONFLICT(UserId, ItemId) DO UPDATE SET
                    ReviewText = $reviewText,
                    UserName   = $userName,
                    UpdatedAt  = $now";
            cmd.Parameters.AddWithValue("$userId", Norm(userId));
            cmd.Parameters.AddWithValue("$userName", userName ?? string.Empty);
            cmd.Parameters.AddWithValue("$itemId", Norm(itemId));
            cmd.Parameters.AddWithValue("$reviewText", reviewText ?? string.Empty);
            cmd.Parameters.AddWithValue("$now", NowIso());
            cmd.ExecuteNonQuery();
        }
    }

    public bool UpdateReview(long reviewId, Guid userId, string reviewText)
    {
        lock (_writeLock)
        {
            using var connection = OpenConnection();
            using var cmd = connection.CreateCommand();
            cmd.CommandText = @"
                UPDATE Reviews SET ReviewText = $text, UpdatedAt = $now
                WHERE Id = $id AND UserId = $userId";
            cmd.Parameters.AddWithValue("$text", reviewText ?? string.Empty);
            cmd.Parameters.AddWithValue("$now", NowIso());
            cmd.Parameters.AddWithValue("$id", reviewId);
            cmd.Parameters.AddWithValue("$userId", Norm(userId));
            return cmd.ExecuteNonQuery() > 0;
        }
    }

    public bool DeleteReview(long reviewId, Guid userId)
    {
        lock (_writeLock)
        {
            using var connection = OpenConnection();
            using var cmd = connection.CreateCommand();
            cmd.CommandText = "DELETE FROM Reviews WHERE Id = $id AND UserId = $userId";
            cmd.Parameters.AddWithValue("$id", reviewId);
            cmd.Parameters.AddWithValue("$userId", Norm(userId));
            return cmd.ExecuteNonQuery() > 0;
        }
    }

    public bool DeleteReviewAsAdmin(long reviewId)
    {
        lock (_writeLock)
        {
            using var connection = OpenConnection();
            using var cmd = connection.CreateCommand();
            cmd.CommandText = "DELETE FROM Reviews WHERE Id = $id";
            cmd.Parameters.AddWithValue("$id", reviewId);
            return cmd.ExecuteNonQuery() > 0;
        }
    }

    public IEnumerable<ReviewDto> GetItemReviews(Guid itemId)
    {
        using var connection = OpenConnection();
        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            SELECT r.Id, r.UserId, r.UserName, r.ItemId, r.ReviewText, r.CreatedAt, r.UpdatedAt,
                   COALESCE(rat.Rating, 0) AS UserRating
            FROM Reviews r
            LEFT JOIN Ratings rat ON r.UserId = rat.UserId AND r.ItemId = rat.ItemId
            WHERE r.ItemId = $itemId
            ORDER BY r.CreatedAt DESC";
        cmd.Parameters.AddWithValue("$itemId", Norm(itemId));

        var results = new List<ReviewDto>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            results.Add(new ReviewDto
            {
                Id         = reader.GetInt64(0),
                UserId     = ParseGuid(reader.GetString(1)),
                UserName   = reader.GetString(2),
                ItemId     = ParseGuid(reader.GetString(3)),
                ReviewText = reader.GetString(4),
                CreatedAt  = ParseIso(reader.GetString(5)),
                UpdatedAt  = ParseIso(reader.GetString(6)),
                UserRating = reader.GetDouble(7)
            });
        }

        return results;
    }

    public IEnumerable<AdminReviewDto> GetAllReviews()
    {
        using var connection = OpenConnection();
        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            SELECT r.Id, r.UserId, r.UserName, r.ItemId, r.ReviewText, r.CreatedAt, r.UpdatedAt,
                   COALESCE(rat.Rating, 0) AS UserRating
            FROM Reviews r
            LEFT JOIN Ratings rat ON r.UserId = rat.UserId AND r.ItemId = rat.ItemId
            ORDER BY r.UpdatedAt DESC";

        var results = new List<AdminReviewDto>();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            results.Add(new AdminReviewDto
            {
                Id         = reader.GetInt64(0),
                UserId     = ParseGuid(reader.GetString(1)),
                UserName   = reader.GetString(2),
                ItemId     = ParseGuid(reader.GetString(3)),
                ReviewText = reader.GetString(4),
                CreatedAt  = ParseIso(reader.GetString(5)),
                UpdatedAt  = ParseIso(reader.GetString(6)),
                UserRating = reader.GetDouble(7)
            });
        }

        return results;
    }

    public void UpdateUserName(Guid userId, string newUserName)
    {
        lock (_writeLock)
        {
            using var connection = OpenConnection();
            using var cmd = connection.CreateCommand();
            cmd.CommandText = "UPDATE Reviews SET UserName = $name WHERE UserId = $userId";
            cmd.Parameters.AddWithValue("$name", newUserName ?? string.Empty);
            cmd.Parameters.AddWithValue("$userId", Norm(userId));
            cmd.ExecuteNonQuery();
        }
    }

    // ── Statistiques ──────────────────────────────────────────────────────────

    public UserStatsDto GetUserStats(Guid userId)
    {
        using var connection = OpenConnection();
        var stats = new UserStatsDto();

        using (var aggregate = connection.CreateCommand())
        {
            aggregate.CommandText = @"
                SELECT COUNT(*),
                       COALESCE(AVG(Rating), 0),
                       COALESCE(MAX(Rating), 0),
                       COALESCE(MIN(Rating), 0)
                FROM Ratings WHERE UserId = $userId";
            aggregate.Parameters.AddWithValue("$userId", Norm(userId));

            using var reader = aggregate.ExecuteReader();
            if (reader.Read())
            {
                stats.TotalRatings   = reader.GetInt32(0);
                stats.AverageRating  = stats.TotalRatings == 0 ? 0 : Math.Round(reader.GetDouble(1), 2);
                stats.HighestRating  = stats.TotalRatings == 0 ? null : reader.GetDouble(2);
                stats.LowestRating   = stats.TotalRatings == 0 ? null : reader.GetDouble(3);
            }
        }

        using (var reviewsCount = connection.CreateCommand())
        {
            reviewsCount.CommandText = @"SELECT COUNT(*) FROM Reviews WHERE UserId = $userId AND TRIM(ReviewText) <> ''";
            reviewsCount.Parameters.AddWithValue("$userId", Norm(userId));
            stats.TotalReviews = Convert.ToInt32(reviewsCount.ExecuteScalar(), CultureInfo.InvariantCulture);
        }

        using (var fav = connection.CreateCommand())
        {
            fav.CommandText = @"
                SELECT ItemId FROM Ratings
                WHERE UserId = $userId
                ORDER BY Rating DESC, UpdatedAt DESC
                LIMIT 1";
            fav.Parameters.AddWithValue("$userId", Norm(userId));
            var raw = fav.ExecuteScalar() as string;
            if (!string.IsNullOrEmpty(raw))
            {
                stats.FavoriteItemId = ParseGuid(raw);
            }
        }

        using (var least = connection.CreateCommand())
        {
            least.CommandText = @"
                SELECT ItemId FROM Ratings
                WHERE UserId = $userId
                ORDER BY Rating ASC, UpdatedAt DESC
                LIMIT 1";
            least.Parameters.AddWithValue("$userId", Norm(userId));
            var raw = least.ExecuteScalar() as string;
            if (!string.IsNullOrEmpty(raw))
            {
                stats.LeastFavoriteItemId = ParseGuid(raw);
            }
        }

        using (var distribution = connection.CreateCommand())
        {
            distribution.CommandText = @"
                SELECT Rating, COUNT(*)
                FROM Ratings
                WHERE UserId = $userId
                GROUP BY Rating
                ORDER BY Rating ASC";
            distribution.Parameters.AddWithValue("$userId", Norm(userId));

            using var reader = distribution.ExecuteReader();
            while (reader.Read())
            {
                stats.Distribution.Add(new RatingDistributionEntry
                {
                    Bucket = reader.GetDouble(0),
                    Count  = reader.GetInt32(1)
                });
            }
        }

        return stats;
    }

    // ── Import / Export ───────────────────────────────────────────────────────

    public ExportPayload ExportForUser(Guid userId)
    {
        var payload = new ExportPayload();

        using var connection = OpenConnection();

        using (var ratingsCmd = connection.CreateCommand())
        {
            ratingsCmd.CommandText = @"
                SELECT ItemId, Rating, CreatedAt, UpdatedAt
                FROM Ratings WHERE UserId = $userId
                ORDER BY UpdatedAt DESC";
            ratingsCmd.Parameters.AddWithValue("$userId", Norm(userId));

            using var reader = ratingsCmd.ExecuteReader();
            while (reader.Read())
            {
                payload.Ratings.Add(new ExportRating
                {
                    ItemId    = ParseGuid(reader.GetString(0)),
                    Rating    = reader.GetDouble(1),
                    CreatedAt = ParseIso(reader.GetString(2)),
                    UpdatedAt = ParseIso(reader.GetString(3))
                });
            }
        }

        using (var reviewsCmd = connection.CreateCommand())
        {
            reviewsCmd.CommandText = @"
                SELECT ItemId, ReviewText, CreatedAt, UpdatedAt
                FROM Reviews WHERE UserId = $userId
                ORDER BY UpdatedAt DESC";
            reviewsCmd.Parameters.AddWithValue("$userId", Norm(userId));

            using var reader = reviewsCmd.ExecuteReader();
            while (reader.Read())
            {
                payload.Reviews.Add(new ExportReview
                {
                    ItemId     = ParseGuid(reader.GetString(0)),
                    ReviewText = reader.GetString(1),
                    CreatedAt  = ParseIso(reader.GetString(2)),
                    UpdatedAt  = ParseIso(reader.GetString(3))
                });
            }
        }

        return payload;
    }

    public ImportResultDto ImportForUser(Guid userId, string userName, ImportRequest request)
    {
        var result = new ImportResultDto();

        lock (_writeLock)
        {
            using var connection = OpenConnection();
            using var tx = connection.BeginTransaction();

            foreach (var rating in request.Ratings ?? new List<ExportRating>())
            {
                if (rating.ItemId == Guid.Empty)
                {
                    result.RatingsSkipped++;
                    continue;
                }

                using var cmd = connection.CreateCommand();
                cmd.Transaction = tx;

                if (request.Overwrite)
                {
                    cmd.CommandText = @"
                        INSERT INTO Ratings (UserId, ItemId, Rating, CreatedAt, UpdatedAt)
                        VALUES ($userId, $itemId, $rating, $created, $updated)
                        ON CONFLICT(UserId, ItemId) DO UPDATE SET
                            Rating    = $rating,
                            UpdatedAt = $updated";
                }
                else
                {
                    cmd.CommandText = @"
                        INSERT OR IGNORE INTO Ratings (UserId, ItemId, Rating, CreatedAt, UpdatedAt)
                        VALUES ($userId, $itemId, $rating, $created, $updated)";
                }

                cmd.Parameters.AddWithValue("$userId", Norm(userId));
                cmd.Parameters.AddWithValue("$itemId", Norm(rating.ItemId));
                cmd.Parameters.AddWithValue("$rating", NormalizeRating(rating.Rating));
                cmd.Parameters.AddWithValue("$created", rating.CreatedAt == default ? NowIso() : rating.CreatedAt.ToString("O", CultureInfo.InvariantCulture));
                cmd.Parameters.AddWithValue("$updated", rating.UpdatedAt == default ? NowIso() : rating.UpdatedAt.ToString("O", CultureInfo.InvariantCulture));

                var affected = cmd.ExecuteNonQuery();
                if (affected > 0)
                {
                    result.RatingsImported++;
                }
                else
                {
                    result.RatingsSkipped++;
                }
            }

            foreach (var review in request.Reviews ?? new List<ExportReview>())
            {
                if (review.ItemId == Guid.Empty || string.IsNullOrWhiteSpace(review.ReviewText))
                {
                    result.ReviewsSkipped++;
                    continue;
                }

                using var cmd = connection.CreateCommand();
                cmd.Transaction = tx;

                if (request.Overwrite)
                {
                    cmd.CommandText = @"
                        INSERT INTO Reviews (UserId, UserName, ItemId, ReviewText, CreatedAt, UpdatedAt)
                        VALUES ($userId, $userName, $itemId, $text, $created, $updated)
                        ON CONFLICT(UserId, ItemId) DO UPDATE SET
                            ReviewText = $text,
                            UserName   = $userName,
                            UpdatedAt  = $updated";
                }
                else
                {
                    cmd.CommandText = @"
                        INSERT OR IGNORE INTO Reviews (UserId, UserName, ItemId, ReviewText, CreatedAt, UpdatedAt)
                        VALUES ($userId, $userName, $itemId, $text, $created, $updated)";
                }

                cmd.Parameters.AddWithValue("$userId", Norm(userId));
                cmd.Parameters.AddWithValue("$userName", userName ?? string.Empty);
                cmd.Parameters.AddWithValue("$itemId", Norm(review.ItemId));
                cmd.Parameters.AddWithValue("$text", review.ReviewText ?? string.Empty);
                cmd.Parameters.AddWithValue("$created", review.CreatedAt == default ? NowIso() : review.CreatedAt.ToString("O", CultureInfo.InvariantCulture));
                cmd.Parameters.AddWithValue("$updated", review.UpdatedAt == default ? NowIso() : review.UpdatedAt.ToString("O", CultureInfo.InvariantCulture));

                var affected = cmd.ExecuteNonQuery();
                if (affected > 0)
                {
                    result.ReviewsImported++;
                }
                else
                {
                    result.ReviewsSkipped++;
                }
            }

            tx.Commit();
        }

        return result;
    }

    public void PurgeItem(Guid itemId)
    {
        lock (_writeLock)
        {
            using var connection = OpenConnection();
            using var tx = connection.BeginTransaction();

            using (var ratingsCmd = connection.CreateCommand())
            {
                ratingsCmd.Transaction = tx;
                ratingsCmd.CommandText = "DELETE FROM Ratings WHERE ItemId = $itemId";
                ratingsCmd.Parameters.AddWithValue("$itemId", Norm(itemId));
                ratingsCmd.ExecuteNonQuery();
            }

            using (var reviewsCmd = connection.CreateCommand())
            {
                reviewsCmd.Transaction = tx;
                reviewsCmd.CommandText = "DELETE FROM Reviews WHERE ItemId = $itemId";
                reviewsCmd.Parameters.AddWithValue("$itemId", Norm(itemId));
                reviewsCmd.ExecuteNonQuery();
            }

            tx.Commit();
        }
    }
}
