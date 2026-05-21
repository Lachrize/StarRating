using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace Jellyfin.Plugin.StarRating.Models;

public class RatingSummaryDto
{
    public double AverageRating { get; set; }
    public int TotalRatings { get; set; }
}

public class UserRatingDto
{
    public Guid ItemId { get; set; }
    public double Rating { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class MyRatingDto
{
    public Guid ItemId { get; set; }
    public double Rating { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class RatingDto
{
    public Guid UserId { get; set; }
    public double Rating { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class ReviewDto
{
    public long Id { get; set; }
    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public Guid ItemId { get; set; }
    public string ReviewText { get; set; } = string.Empty;
    public double UserRating { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class SetRatingRequest
{
    [Required]
    public Guid ItemId { get; set; }

    [Required]
    [Range(0.5, 5.0)]
    public double Rating { get; set; }
}

public class AddReviewRequest
{
    [Required]
    public Guid ItemId { get; set; }

    public string ReviewText { get; set; } = string.Empty;
}

public class UpdateReviewRequest
{
    public string ReviewText { get; set; } = string.Empty;
}

public class BatchSummaryRequest
{
    [Required]
    public List<Guid> ItemIds { get; set; } = new();
}

public class BatchSummaryResponseItem
{
    public Guid ItemId { get; set; }
    public double AverageRating { get; set; }
    public int TotalRatings { get; set; }
}

public class BatchMyRatingsResponseItem
{
    public Guid ItemId { get; set; }
    public double Rating { get; set; }
}

public class RatingDistributionEntry
{
    public double Bucket { get; set; }
    public int Count { get; set; }
}

public class UserStatsDto
{
    public int TotalRatings { get; set; }
    public int TotalReviews { get; set; }
    public double AverageRating { get; set; }
    public double? HighestRating { get; set; }
    public double? LowestRating { get; set; }
    public Guid? FavoriteItemId { get; set; }
    public Guid? LeastFavoriteItemId { get; set; }
    public List<RatingDistributionEntry> Distribution { get; set; } = new();
}

public class PluginPublicConfigDto
{
    public bool AllowSelfReview { get; set; }
    public int MaxReviewLength { get; set; }
    public bool ShowAverageOnPosters { get; set; }
    public bool AllowedTypeMovie { get; set; }
    public bool AllowedTypeSeries { get; set; }
    public bool ReviewsEnabled { get; set; }
    public bool IsAdmin { get; set; }
}

public class ExportPayload
{
    public string Version { get; set; } = "1";
    public DateTime ExportedAt { get; set; } = DateTime.UtcNow;
    public List<ExportRating> Ratings { get; set; } = new();
    public List<ExportReview> Reviews { get; set; } = new();
}

public class ExportRating
{
    public Guid ItemId { get; set; }
    public double Rating { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class ExportReview
{
    public Guid ItemId { get; set; }
    public string ReviewText { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class ImportRequest
{
    public List<ExportRating> Ratings { get; set; } = new();
    public List<ExportReview> Reviews { get; set; } = new();
    public bool Overwrite { get; set; } = false;
}

public class ImportResultDto
{
    public int RatingsImported { get; set; }
    public int RatingsSkipped { get; set; }
    public int ReviewsImported { get; set; }
    public int ReviewsSkipped { get; set; }
}

public class AdminReviewDto
{
    public long Id { get; set; }
    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public Guid ItemId { get; set; }
    public string ReviewText { get; set; } = string.Empty;
    public double UserRating { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
