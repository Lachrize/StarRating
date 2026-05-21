using System;

namespace Jellyfin.Plugin.StarRating.Models;

public class UserRating
{
    public long Id { get; set; }
    public Guid UserId { get; set; }
    public Guid ItemId { get; set; }
    public double Rating { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
