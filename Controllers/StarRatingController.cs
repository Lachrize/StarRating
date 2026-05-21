using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Mime;
using System.Reflection;
using Jellyfin.Api.Extensions;
using Jellyfin.Plugin.StarRating.Configuration;
using Jellyfin.Plugin.StarRating.Models;
using Jellyfin.Plugin.StarRating.Services;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.StarRating.Controllers;

[ApiController]
[Route("StarRating")]
[Produces(MediaTypeNames.Application.Json)]
public class StarRatingController : ControllerBase
{
    private readonly RatingService _ratingService;
    private readonly IUserManager _userManager;
    private readonly ILibraryManager _libraryManager;
    private readonly ILogger<StarRatingController> _logger;

    public StarRatingController(
        RatingService ratingService,
        IUserManager userManager,
        ILibraryManager libraryManager,
        ILogger<StarRatingController> logger)
    {
        _ratingService = ratingService;
        _userManager = userManager;
        _libraryManager = libraryManager;
        _logger = logger;
    }

    // ── Assets web embarqués ─────────────────────────────────────────────────

    [HttpGet("web/starrating.js")]
    [AllowAnonymous]
    [Produces("application/javascript")]
    public IActionResult GetScript()
        => EmbeddedWebAsset("starrating.js", "application/javascript; charset=utf-8");

    [HttpGet("web/starrating.css")]
    [AllowAnonymous]
    [Produces("text/css")]
    public IActionResult GetStyles()
        => EmbeddedWebAsset("starrating.css", "text/css; charset=utf-8");

    private IActionResult EmbeddedWebAsset(string fileName, string contentType)
    {
        var resourceName = $"Jellyfin.Plugin.StarRating.Web.{fileName}";
        var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(resourceName);
        if (stream is null)
        {
            return NotFound();
        }

        using var reader = new StreamReader(stream);
        return Content(reader.ReadToEnd(), contentType);
    }

    // ── Configuration publique ────────────────────────────────────────────────

    [HttpGet("config")]
    [Authorize]
    [ProducesResponseType(typeof(PluginPublicConfigDto), StatusCodes.Status200OK)]
    public ActionResult<PluginPublicConfigDto> GetPublicConfig()
    {
        var config = GetConfig();

        return Ok(new PluginPublicConfigDto
        {
            AllowSelfReview      = config.AllowSelfReview,
            MaxReviewLength      = config.MaxReviewLength,
            ShowAverageOnPosters = config.ShowAverageOnPosters,
            AllowedTypeMovie     = config.AllowedTypeMovie,
            AllowedTypeSeries    = config.AllowedTypeSeries,
            ReviewsEnabled       = config.AllowSelfReview,
            IsAdmin              = IsCurrentUserAdmin()
        });
    }

    // ── Ratings ──────────────────────────────────────────────────────────────

    [HttpGet("summary/{itemId}")]
    [Authorize]
    [ProducesResponseType(typeof(RatingSummaryDto), StatusCodes.Status200OK)]
    public ActionResult<RatingSummaryDto> GetRatingSummary([FromRoute] Guid itemId)
        => Ok(_ratingService.GetRatingSummary(itemId));

    [HttpPost("summaries")]
    [Authorize]
    [ProducesResponseType(typeof(IEnumerable<BatchSummaryResponseItem>), StatusCodes.Status200OK)]
    public ActionResult<IEnumerable<BatchSummaryResponseItem>> GetRatingSummaries([FromBody] BatchSummaryRequest request)
    {
        if (request?.ItemIds == null || request.ItemIds.Count == 0)
        {
            return Ok(Array.Empty<BatchSummaryResponseItem>());
        }

        return Ok(_ratingService.GetRatingSummaries(request.ItemIds));
    }

    [HttpGet("rating/{itemId}")]
    [Authorize]
    [ProducesResponseType(typeof(UserRatingDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult<UserRatingDto> GetMyRating([FromRoute] Guid itemId)
    {
        var userId = GetCurrentUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var rating = _ratingService.GetUserRating(userId, itemId);
        if (rating is null) return NotFound();

        return Ok(new UserRatingDto
        {
            ItemId    = itemId,
            Rating    = rating.Rating,
            UpdatedAt = rating.UpdatedAt
        });
    }

    [HttpGet("my-ratings")]
    [Authorize]
    [ProducesResponseType(typeof(IEnumerable<MyRatingDto>), StatusCodes.Status200OK)]
    public ActionResult<IEnumerable<MyRatingDto>> GetMyRatings()
    {
        var userId = GetCurrentUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var config = GetConfig();
        var all = _ratingService.GetUserRatings(userId);
        var filtered = new List<MyRatingDto>();

        foreach (var rating in all)
        {
            var item = _libraryManager.GetItemById(rating.ItemId);
            if (item is null) continue;

            var typeName = (item is BaseItem baseItem) ? baseItem.GetClientTypeName() : string.Empty;
            var allowed =
                (config.AllowedTypeMovie && string.Equals(typeName, "Movie", StringComparison.OrdinalIgnoreCase))
                || (config.AllowedTypeSeries && string.Equals(typeName, "Series", StringComparison.OrdinalIgnoreCase));

            if (allowed)
            {
                filtered.Add(rating);
            }
        }

        return Ok(filtered);
    }

    [HttpPost("my-ratings/batch")]
    [Authorize]
    [ProducesResponseType(typeof(IEnumerable<BatchMyRatingsResponseItem>), StatusCodes.Status200OK)]
    public ActionResult<IEnumerable<BatchMyRatingsResponseItem>> GetMyRatingsBatch([FromBody] BatchSummaryRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId == Guid.Empty) return Unauthorized();

        if (request?.ItemIds == null || request.ItemIds.Count == 0)
        {
            return Ok(Array.Empty<BatchMyRatingsResponseItem>());
        }

        return Ok(_ratingService.GetUserRatingsForItems(userId, request.ItemIds));
    }

    [HttpPost("rating")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult SetRating([FromBody] SetRatingRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        var userId = GetCurrentUserId();
        if (userId == Guid.Empty) return Unauthorized();

        if (!IsRateableItem(request.ItemId, out var problem))
        {
            return problem;
        }

        _ratingService.SetRating(userId, request.ItemId, request.Rating);
        return NoContent();
    }

    [HttpDelete("rating/{itemId}")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult DeleteRating([FromRoute] Guid itemId)
    {
        var userId = GetCurrentUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var removed = _ratingService.DeleteRating(userId, itemId);
        return removed ? NoContent() : NotFound();
    }

    // ── Reviews ───────────────────────────────────────────────────────────────

    [HttpGet("reviews/{itemId}")]
    [Authorize]
    [ProducesResponseType(typeof(IEnumerable<ReviewDto>), StatusCodes.Status200OK)]
    public ActionResult<IEnumerable<ReviewDto>> GetReviews([FromRoute] Guid itemId)
    {
        var reviews = _ratingService.GetItemReviews(itemId).ToList();
        TryRefreshUserNames(reviews);
        return Ok(reviews);
    }

    [HttpPost("review")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public ActionResult AddReview([FromBody] AddReviewRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        var userId = GetCurrentUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var config = GetConfig();
        if (!config.AllowSelfReview)
        {
            return StatusCode(StatusCodes.Status403Forbidden);
        }

        if (!IsRateableItem(request.ItemId, out var problem))
        {
            return problem;
        }

        var text = SanitizeReviewText(request.ReviewText, config.MaxReviewLength);
        var user = _userManager.GetUserById(userId);
        var userName = user?.Username ?? "Utilisateur inconnu";

        _ratingService.AddReview(userId, userName, request.ItemId, text);
        return NoContent();
    }

    [HttpPut("review/{reviewId}")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult UpdateReview([FromRoute] long reviewId, [FromBody] UpdateReviewRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        var userId = GetCurrentUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var config = GetConfig();
        var text = SanitizeReviewText(request.ReviewText, config.MaxReviewLength);

        if (!_ratingService.UpdateReview(reviewId, userId, text))
        {
            return NotFound();
        }

        return NoContent();
    }

    [HttpDelete("review/{reviewId}")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult DeleteReview([FromRoute] long reviewId)
    {
        var userId = GetCurrentUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var removed = _ratingService.DeleteReview(reviewId, userId);
        return removed ? NoContent() : NotFound();
    }

    // ── Stats ────────────────────────────────────────────────────────────────

    [HttpGet("stats")]
    [Authorize]
    [ProducesResponseType(typeof(UserStatsDto), StatusCodes.Status200OK)]
    public ActionResult<UserStatsDto> GetStats()
    {
        var userId = GetCurrentUserId();
        if (userId == Guid.Empty) return Unauthorized();

        return Ok(_ratingService.GetUserStats(userId));
    }

    // ── Import / Export ──────────────────────────────────────────────────────

    [HttpGet("export")]
    [Authorize]
    [ProducesResponseType(typeof(ExportPayload), StatusCodes.Status200OK)]
    public ActionResult<ExportPayload> Export()
    {
        var userId = GetCurrentUserId();
        if (userId == Guid.Empty) return Unauthorized();

        return Ok(_ratingService.ExportForUser(userId));
    }

    [HttpPost("import")]
    [Authorize]
    [ProducesResponseType(typeof(ImportResultDto), StatusCodes.Status200OK)]
    public ActionResult<ImportResultDto> Import([FromBody] ImportRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var user = _userManager.GetUserById(userId);
        var userName = user?.Username ?? "Utilisateur inconnu";

        var result = _ratingService.ImportForUser(userId, userName, request ?? new ImportRequest());
        return Ok(result);
    }

    // ── Modération admin ─────────────────────────────────────────────────────

    [HttpGet("admin/reviews")]
    [Authorize(Policy = "RequiresElevation")]
    [ProducesResponseType(typeof(IEnumerable<AdminReviewDto>), StatusCodes.Status200OK)]
    public ActionResult<IEnumerable<AdminReviewDto>> GetAllReviewsAdmin()
        => Ok(_ratingService.GetAllReviews());

    [HttpDelete("admin/review/{reviewId}")]
    [Authorize(Policy = "RequiresElevation")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult DeleteReviewAdmin([FromRoute] long reviewId)
    {
        var removed = _ratingService.DeleteReviewAsAdmin(reviewId);
        return removed ? NoContent() : NotFound();
    }

    [HttpDelete("admin/item/{itemId}")]
    [Authorize(Policy = "RequiresElevation")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public ActionResult PurgeItem([FromRoute] Guid itemId)
    {
        _ratingService.PurgeItem(itemId);
        return NoContent();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Guid GetCurrentUserId() => User.GetUserId();

    private bool IsCurrentUserAdmin() => User.IsInRole("Administrator");

    private static PluginConfiguration GetConfig()
        => Plugin.Instance?.Configuration ?? new PluginConfiguration();

    private static string SanitizeReviewText(string? raw, int maxLength)
    {
        var text = (raw ?? string.Empty).Trim();
        if (maxLength > 0 && text.Length > maxLength)
        {
            text = text.Substring(0, maxLength);
        }

        return text;
    }

    private bool IsRateableItem(Guid itemId, out ActionResult problem)
    {
        problem = NoContent();

        if (itemId == Guid.Empty)
        {
            problem = BadRequest(new { error = "ItemId is required." });
            return false;
        }

        var item = _libraryManager.GetItemById(itemId);
        if (item is null)
        {
            problem = NotFound(new { error = "Item not found in library." });
            return false;
        }

        var config = GetConfig();
        var typeName = (item is BaseItem baseItem) ? baseItem.GetClientTypeName() : string.Empty;

        var allowed =
            (config.AllowedTypeMovie && string.Equals(typeName, "Movie", StringComparison.OrdinalIgnoreCase))
            || (config.AllowedTypeSeries && string.Equals(typeName, "Series", StringComparison.OrdinalIgnoreCase));

        if (!allowed)
        {
            problem = BadRequest(new { error = "This item type is not rateable." });
            return false;
        }

        return true;
    }

    private void TryRefreshUserNames(IList<ReviewDto> reviews)
    {
        try
        {
            foreach (var review in reviews)
            {
                var user = _userManager.GetUserById(review.UserId);
                if (user is null) continue;

                if (!string.Equals(user.Username, review.UserName, StringComparison.Ordinal))
                {
                    review.UserName = user.Username;
                    _ratingService.UpdateUserName(review.UserId, user.Username);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to refresh user names for reviews");
        }
    }
}
