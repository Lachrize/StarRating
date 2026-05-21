/**
 * StarRating – Plugin web Jellyfin
 *
 *  - Page détaillée : notation, avis (édition/suppression), résumé serveur
 *  - Accueil : onglet StarRating avec filtres, stats, import/export
 *  - Badges sur les affiches (moyenne serveur ou note perso selon config)
 *  - Modération admin
 */
(function () {
    'use strict';

    if (window.__starRatingLoaded) {
        try { console.warn('[StarRating] script déjà chargé, exécution ignorée.'); } catch (_) {}
        return;
    }
    window.__starRatingLoaded = true;

    var PLUGIN_ID = 'a4df60c5-6b46-4ce4-b6b7-d95a75b25c9e';
    var STAR_FULL = '★';
    var ASSET_VERSION = '20260521-1400';
    var DEBUG = false;
    var deleteRatingFlowOpen = false;

    function log() {
        if (!DEBUG) return;
        try { console.log.apply(console, ['[StarRating]'].concat(Array.prototype.slice.call(arguments))); } catch (_) {}
    }

    // ── i18n ──────────────────────────────────────────────────────────────────

    var STRINGS = {
        fr: {
            sectionTitle: 'Notes & Avis',
            loading: 'Chargement…',
            yourRating: 'Votre note',
            yourRatingValue: function (v) { return 'Votre note : ' + v + ' / 5'; },
            deleteMyRating: 'Supprimer ma note',
            placeholderReview: 'Laisser un avis (facultatif)…',
            publish: 'Publier',
            update: 'Mettre à jour',
            save: 'Enregistrer',
            cancel: 'Annuler',
            edit: 'Modifier',
            del: 'Supprimer',
            noReviews: 'Aucun avis pour ce titre.',
            noRatings: 'Aucune note pour ce titre.',
            loadingReviews: 'Chargement des avis…',
            loadingFailed: 'Impossible de charger les avis.',
            ratingsCount: function (n) { return n + ' note' + (n > 1 ? 's' : ''); },
            confirmDeleteRating: 'Supprimer définitivement votre note et votre avis ?',
            confirmDeleteReview: 'Supprimer définitivement cet avis ?',
            confirmDeleteReviewAdmin: 'Supprimer (modération) cet avis ?',
            confirmPurge: 'Supprimer toutes les notes et avis pour cet item ?',
            search: 'Recherche',
            ratingMin: 'Note min.',
            ratingMax: 'Note max.',
            all: 'Tous',
            allF: 'Toutes',
            type: 'Type',
            sortBy: 'Trier',
            sortRatingDesc: 'Meilleures notes',
            sortRatingAsc: 'Moins bonnes notes',
            sortDateDesc: 'Dernière note',
            sortDateAsc: 'Plus ancienne note',
            sortTitleAsc: 'Titre A-Z',
            typeMovie: 'Films',
            typeSeries: 'Séries',
            tabHome: 'StarRating',
            homeTitle: 'StarRating',
            homeSubtitle: 'Tous les médias que vous avez notés, avec filtres, statistiques et tri.',
            filtersSection: 'Filtres',
            statsSection: 'Statistiques',
            toolsSection: 'Outils',
            statTotalRatings: 'Notes',
            statTotalReviews: 'Avis',
            statAverage: 'Moyenne',
            statHighest: 'Meilleure',
            statLowest: 'Pire',
            distribution: 'Répartition',
            export: 'Exporter mes notes',
            import: 'Importer',
            exportFormat: 'Format d\'export',
            importFormat: 'Format d\'import',
            formatJson: 'JSON',
            formatCsv: 'CSV',
            importMerge: 'Fusionner',
            importOverwrite: 'Écraser',
            importFileLabel: 'Choisir un fichier',
            importSuccess: function (r) { return 'Import terminé : ' + r.ratings + ' notes, ' + r.reviews + ' commentaires traités.'; },
            results: function (n) { return n + ' résultat' + (n > 1 ? 's' : ''); },
            noResults: 'Aucun média ne correspond aux filtres.',
            cannotLoadRatings: 'Impossible de charger vos notes.',
            errorGeneric: 'Une erreur est survenue. Vérifiez votre connexion.',
            errorReviewDisabled: 'Les avis ont été désactivés par l\'administrateur.',
            errorItemUnsupported: 'Ce type d\'élément n\'est pas notable.',
            errorNotFound: 'Élément introuvable.',
            mediaUnknown: 'Média introuvable',
            ratedOn: function (d) { return 'Noté le ' + d; },
            adminTabReviews: 'Modération',
            adminEmpty: 'Aucun avis à modérer.',
            adminDelete: 'Supprimer',
            adminPurge: 'Tout purger pour ce média',
            dataPersistenceNote: 'Vos notes sont enregistrées sur le serveur Jellyfin (fichier starrating.db), pas dans le dépôt du plugin. Supprimer ou réajouter le dépôt ne les efface pas. Pour repartir à zéro : désinstallez le plugin, supprimez starrating.db dans le dossier de données Jellyfin, puis réinstallez.'
        }
    };

    function t(key, arg) {
        var entry = STRINGS.fr[key];
        if (typeof entry === 'function') return entry(arg);
        return entry !== undefined ? entry : key;
    }

    // ── Notifications utilisateur ────────────────────────────────────────────

    function toast(message) {
        try {
            if (window.Dashboard && typeof Dashboard.alert === 'function') {
                Dashboard.alert({ message: String(message), title: 'StarRating' });
                return;
            }
        } catch (_) {}
        try {
            if (window.toast) { window.toast(message); return; }
        } catch (_) {}
    }

    function confirmDialog(message) {
        return new Promise(function (resolve) {
            var existing = document.querySelector('.sr-confirm-overlay');
            if (existing) existing.remove();

            var overlay = document.createElement('div');
            overlay.className = 'sr-confirm-overlay';

            var modal = document.createElement('div');
            modal.className = 'sr-confirm-modal';
            modal.innerHTML =
                '<div class="sr-confirm-title">StarRating</div>' +
                '<div class="sr-confirm-text"></div>' +
                '<div class="sr-confirm-actions">' +
                    '<button type="button" class="sr-confirm-btn sr-confirm-ok">Oui</button>' +
                    '<button type="button" class="sr-confirm-btn sr-confirm-cancel">Non</button>' +
                '</div>';
            modal.querySelector('.sr-confirm-text').textContent = String(message);

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            var done = false;
            function finish(value) {
                if (done) return;
                done = true;
                document.removeEventListener('keydown', onKey, true);
                overlay.remove();
                resolve(value);
            }

            function onKey(event) {
                if (event.key === 'Escape') { event.preventDefault(); finish(false); }
                else if (event.key === 'Enter') { event.preventDefault(); finish(true); }
            }

            overlay.addEventListener('click', function (event) {
                if (event.target === overlay) finish(false);
            });
            modal.querySelector('.sr-confirm-cancel').addEventListener('click', function () { finish(false); });
            modal.querySelector('.sr-confirm-ok').addEventListener('click', function () { finish(true); });
            document.addEventListener('keydown', onKey, true);

            setTimeout(function () {
                var okBtn = modal.querySelector('.sr-confirm-ok');
                if (okBtn) okBtn.focus();
            }, 0);
        });
    }

    function explainError(err) {
        var status = err && (err.status || (err.response && err.response.status));
        if (status === 403) return t('errorReviewDisabled');
        if (status === 404) return t('errorNotFound');
        if (status === 400) return t('errorItemUnsupported');
        return t('errorGeneric');
    }

    function deleteRatingFromSection(section, itemId, shared) {
        log('deleteRatingFromSection start', { itemId: itemId, flow: deleteRatingFlowOpen, hasSection: !!section });
        if (!section || !itemId || deleteRatingFlowOpen) return;
        deleteRatingFlowOpen = true;

        var delBtn = section.querySelector('#sr-delete-rating');
        confirmDialog(t('confirmDeleteRating')).then(function (ok) {
            log('confirmDialog resolved with', ok);
            if (!ok) {
                deleteRatingFlowOpen = false;
                return;
            }

            if (delBtn) delBtn.disabled = true;
            log('DELETE rating/' + itemId);

            apiFetch('DELETE', 'rating/' + itemId).then(function () {
                log('DELETE rating success');
                var container = section.querySelector('#sr-stars-input');
                var label = section.querySelector('#sr-rating-label');
                var textarea  = section.querySelector('#sr-review-text');
                var charCount = section.querySelector('#sr-char-count');
                var submitBtn = section.querySelector('#sr-submit-review');

                if (shared) {
                    shared.reviewToken++;
                    shared.reviewId = null;
                    shared.currentRating = 0;
                    shared.draftRating = 0;
                }

                if (container) updateStarSlots(container, 0);
                if (label) label.textContent = t('yourRating');
                if (delBtn) {
                    delBtn.style.display = 'none';
                    delBtn.disabled = false;
                }
                if (textarea) textarea.value = '';
                if (charCount) charCount.textContent = '0 / ' + pluginConfig.maxReviewLength;
                if (submitBtn) submitBtn.textContent = t('publish');

                setCachedPosterRating(itemId, 0);
                refreshSummary(section, itemId);
                renderReviews(section, itemId);
                loadMyRatings(true);
            }).catch(function (err) {
                log('DELETE rating ERROR', err && (err.status || err.message || err));
                if (delBtn) delBtn.disabled = false;
                toast(explainError(err));
            }).then(function () {
                deleteRatingFlowOpen = false;
            });
        }).catch(function (err) {
            log('confirmDialog chain catch', err);
            deleteRatingFlowOpen = false;
        });
    }

    // ── HTTP ──────────────────────────────────────────────────────────────────

    function apiUrl(path, noCache) {
        var url = ApiClient.getUrl('StarRating/' + path);
        if (!noCache) return url;
        return url + (url.indexOf('?') === -1 ? '?' : '&') + '_=' + Date.now();
    }

    function apiFetch(method, path, body) {
        var isGet = method === 'GET';
        return ApiClient.ajax({
            type: method,
            url: apiUrl(path, isGet),
            data: body ? JSON.stringify(body) : undefined,
            contentType: 'application/json',
            dataType: isGet ? 'json' : undefined,
            cache: false
        });
    }

    function currentUserId() {
        return ApiClient.getCurrentUserId();
    }

    // ── Configuration plugin ─────────────────────────────────────────────────

    var pluginConfig = {
        allowSelfReview: true,
        maxReviewLength: 2000,
        showAverageOnPosters: true,
        allowedTypeMovie: true,
        allowedTypeSeries: true,
        reviewsEnabled: true,
        isAdmin: false,
        loaded: false
    };

    var pluginConfigPromise = null;

    function loadPluginConfig(force) {
        if (!force && pluginConfigPromise) return pluginConfigPromise;
        pluginConfigPromise = apiFetch('GET', 'config').then(function (raw) {
            pluginConfig.allowSelfReview      = !!(raw.allowSelfReview ?? raw.AllowSelfReview);
            pluginConfig.maxReviewLength      = parseInt(raw.maxReviewLength ?? raw.MaxReviewLength ?? 2000, 10) || 2000;
            pluginConfig.showAverageOnPosters = !!(raw.showAverageOnPosters ?? raw.ShowAverageOnPosters);
            pluginConfig.allowedTypeMovie     = !!(raw.allowedTypeMovie ?? raw.AllowedTypeMovie);
            pluginConfig.allowedTypeSeries    = !!(raw.allowedTypeSeries ?? raw.AllowedTypeSeries);
            pluginConfig.reviewsEnabled       = !!(raw.reviewsEnabled ?? raw.ReviewsEnabled);
            pluginConfig.isAdmin              = !!(raw.isAdmin ?? raw.IsAdmin);
            pluginConfig.loaded = true;
            return pluginConfig;
        }).catch(function () {
            pluginConfig.loaded = true;
            return pluginConfig;
        });
        return pluginConfigPromise;
    }

    function rateableTypes() {
        var list = [];
        if (pluginConfig.allowedTypeMovie)  list.push('Movie');
        if (pluginConfig.allowedTypeSeries) list.push('Series');
        return list;
    }

    function isRateableItemType(type) {
        return rateableTypes().indexOf(type) !== -1;
    }

    // ── Utils ────────────────────────────────────────────────────────────────

    function starsHtml(rating) {
        var html = '';
        for (var i = 1; i <= 5; i++) {
            if (rating >= i) {
                html += '<span class="sr-sh sr-sh-full">' + STAR_FULL + '</span>';
            } else if (rating >= i - 0.5) {
                html += '<span class="sr-sh sr-sh-half"><span class="sr-sh-clip">' + STAR_FULL + '</span>' + STAR_FULL + '</span>';
            } else {
                html += '<span class="sr-sh">' + STAR_FULL + '</span>';
            }
        }
        return html;
    }

    function escHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizeItemId(itemId) {
        return String(itemId || '').replace(/-/g, '').toLowerCase();
    }

    function sameId(a, b) {
        return normalizeItemId(a) === normalizeItemId(b);
    }

    function debounce(fn, wait) {
        var timer = null;
        return function () {
            var ctx = this;
            var args = arguments;
            if (timer) clearTimeout(timer);
            timer = setTimeout(function () { fn.apply(ctx, args); timer = null; }, wait);
        };
    }

    // ── Détection page détail ────────────────────────────────────────────────

    function getDetailItemId() {
        var href = window.location.href || '';
        var m = href.match(/[?&]id=([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
        if (m) return m[1];
        m = href.match(/[?&]id=([a-f0-9]{32})/i);
        return m ? m[1] : null;
    }

    function isOnDetailPage() {
        var href = window.location.href || '';
        return href.indexOf('/details') !== -1 || href.indexOf('/item') !== -1;
    }

    // ── Cache d'items Jellyfin ───────────────────────────────────────────────

    var itemTypeCache = {};
    var itemTypeFetching = {};
    var itemCache = {};

    function itemTypeFromItem(item) {
        return item ? (item.Type || item.type || '') : '';
    }

    function loadItemType(itemId) {
        var key = normalizeItemId(itemId);
        if (!key) return Promise.resolve(null);
        if (Object.prototype.hasOwnProperty.call(itemTypeCache, key)) {
            return Promise.resolve(itemTypeCache[key]);
        }
        if (itemTypeFetching[key]) return itemTypeFetching[key];

        var request = typeof ApiClient.getItem === 'function'
            ? ApiClient.getItem(currentUserId(), itemId)
            : ApiClient.ajax({
                type: 'GET',
                url: ApiClient.getUrl('Users/' + currentUserId() + '/Items/' + itemId),
                dataType: 'json'
            });

        itemTypeFetching[key] = request.then(function (item) {
            itemTypeCache[key] = itemTypeFromItem(item) || null;
            itemCache[key] = item || null;
            return itemTypeCache[key];
        }).catch(function () {
            itemTypeCache[key] = null;
            return null;
        }).finally(function () {
            delete itemTypeFetching[key];
        });

        return itemTypeFetching[key];
    }

    function loadJellyfinItems(ids) {
        if (!ids || !ids.length) return Promise.resolve([]);

        if (typeof ApiClient.getItems === 'function') {
            return ApiClient.getItems(currentUserId(), {
                Ids: ids.join(','),
                Fields: 'PrimaryImageAspectRatio,SortName,ProductionYear,Overview'
            }).then(function (result) {
                return result && (result.Items || result.items) ? (result.Items || result.items) : [];
            }).catch(function () { return []; });
        }

        return Promise.all(ids.map(function (id) {
            return ApiClient.ajax({
                type: 'GET',
                url: ApiClient.getUrl('Users/' + currentUserId() + '/Items/' + id),
                dataType: 'json'
            }).catch(function () { return null; });
        })).then(function (items) {
            return items.filter(Boolean);
        });
    }

    // ── Page détail : structure ──────────────────────────────────────────────

    function buildDetailSection() {
        var section = document.createElement('div');
        section.id = 'starrating-section';
        section.innerHTML =
            '<h2>' + t('sectionTitle') + '</h2>' +
            '<div class="sr-summary sr-loading">' + t('loading') + '</div>' +
            '<div class="sr-rating-block">' +
                '<div class="sr-stars-input" id="sr-stars-input"></div>' +
                '<span class="sr-rating-label" id="sr-rating-label">' + t('yourRating') + '</span>' +
                '<button type="button" class="sr-delete-rating-btn" id="sr-delete-rating" style="display:none">' + t('deleteMyRating') + '</button>' +
            '</div>' +
            '<div class="sr-review-form" id="sr-review-form">' +
                '<textarea id="sr-review-text" maxlength="' + pluginConfig.maxReviewLength + '" placeholder="' + t('placeholderReview') + '"></textarea>' +
                '<div class="sr-review-actions">' +
                    '<button class="sr-submit-btn" id="sr-submit-review">' + t('publish') + '</button>' +
                    '<span class="sr-char-count" id="sr-char-count">0 / ' + pluginConfig.maxReviewLength + '</span>' +
                '</div>' +
            '</div>' +
            '<div id="sr-reviews-list" class="sr-reviews-list"></div>';
        return section;
    }

    function renderStarsInput(section, itemId, currentRating, shared) {
        var container = section.querySelector('#sr-stars-input');
        var label     = section.querySelector('#sr-rating-label');
        var delBtn    = section.querySelector('#sr-delete-rating');
        if (delBtn && delBtn.parentNode) {
            var cleanDelBtn = delBtn.cloneNode(true);
            delBtn.parentNode.replaceChild(cleanDelBtn, delBtn);
            delBtn = cleanDelBtn;
        }

        shared.currentRating = currentRating || 0;
        shared.draftRating = shared.currentRating;
        container.innerHTML = '';

        for (var i = 1; i <= 5; i++) {
            var slot = document.createElement('span');
            slot.className = 'sr-star-slot';
            slot.dataset.pos = i;

            var base = document.createElement('span');
            base.className = 'sr-star-base';
            base.textContent = STAR_FULL;

            var half = document.createElement('span');
            half.className = 'sr-star-half-overlay';
            half.textContent = STAR_FULL;

            var left = document.createElement('button');
            left.className = 'sr-half-btn sr-half-left';
            left.dataset.value = i - 0.5;

            var right = document.createElement('button');
            right.className = 'sr-half-btn sr-half-right';
            right.dataset.value = i;

            [left, right].forEach(function (btn) {
                var val = parseFloat(btn.dataset.value);
                btn.addEventListener('mouseover', function () { updateStarSlots(container, val); });
                btn.addEventListener('mouseout',  function () { updateStarSlots(container, shared.draftRating); });
                btn.addEventListener('click', function () {
                    shared.draftRating = val;
                    updateStarSlots(container, val);
                    label.textContent = t('yourRatingValue', val);
                });
            });

            slot.appendChild(base);
            slot.appendChild(half);
            slot.appendChild(left);
            slot.appendChild(right);
            container.appendChild(slot);
        }

        updateStarSlots(container, shared.draftRating);

        if (shared.currentRating > 0) {
            label.textContent = t('yourRatingValue', shared.currentRating);
            delBtn.style.display = 'inline-block';
        }

        delBtn.onclick = function (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
            deleteRatingFromSection(section, itemId, shared);
        };
    }

    function updateStarSlots(container, value) {
        container.querySelectorAll('.sr-star-slot').forEach(function (slot) {
            var pos = parseInt(slot.dataset.pos, 10);
            slot.classList.remove('sr-slot-full', 'sr-slot-half');
            if (value >= pos)            slot.classList.add('sr-slot-full');
            else if (value >= pos - 0.5) slot.classList.add('sr-slot-half');
        });
    }

    function refreshSummary(section, itemId) {
        apiFetch('GET', 'summary/' + itemId).then(function (data) {
            var avg   = data && (data.averageRating ?? data.AverageRating);
            var total = data && (data.totalRatings   ?? data.TotalRatings);
            var value = (!avg || !total) ? 'N/A' : Number(avg).toFixed(1);

            var el = section.querySelector('.sr-summary');
            if (el) {
                el.classList.remove('sr-loading');
                el.innerHTML =
                    '<div class="sr-summary-main">' +
                        '<span class="sr-avg">' + value + '</span>' +
                        '<div>' +
                            '<div class="sr-avg-stars">' + starsHtml(avg || 0) + '</div>' +
                            '<div class="sr-total">' + (total ? t('ratingsCount', total) : t('noRatings')) + '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="sr-summary-average-badge">Moyenne : ' + value + '</div>';
            }

            removeDetailMiscRating(avg);
            setTimeout(function () { removeDetailMiscRating(avg); }, 250);
            setTimeout(function () { removeDetailMiscRating(avg); }, 1000);
        }).catch(function () {
            var el = section.querySelector('.sr-summary');
            if (el) {
                el.classList.remove('sr-loading');
                el.innerHTML =
                    '<div class="sr-summary-main">' +
                        '<span class="sr-avg">N/A</span>' +
                        '<div>' +
                            '<div class="sr-avg-stars">' + starsHtml(0) + '</div>' +
                            '<div class="sr-total">' + t('noRatings') + '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="sr-summary-average-badge">Moyenne : N/A</div>';
            }
            removeDetailMiscRating();
        });
    }

    function removeDetailMiscRating(avg) {
        document.querySelectorAll('.sr-detail-misc-rating').forEach(function (el) {
            el.remove();
        });

        if (!avg) return;

        var page = document.querySelector('#itemDetailPage:not(.hide)');
        if (!page) return;

        var value = Number(avg).toFixed(1);
        var candidates = page.querySelectorAll(
            '.itemMiscInfo .starRatingContainer,' +
            '.itemMiscInfo-primary .starRatingContainer,' +
            '.mediaInfoItems .starRatingContainer,' +
            '.itemMiscInfo .mediaInfoItem,' +
            '.itemMiscInfo-primary .mediaInfoItem,' +
            '.mediaInfoItems .mediaInfoItem'
        );

        candidates.forEach(function (node) {
            if (node.closest('#starrating-section')) return;
            if (node.classList.contains('sr-detail-misc-rating')) {
                node.remove();
                return;
            }

            var text = (node.textContent || '').replace(/\s+/g, ' ').trim();
            if (text === value && (node.classList.contains('starRatingContainer') || node.querySelector('.starIcon, .material-icons'))) {
                node.remove();
            }
        });
    }

    function renderReviews(section, itemId) {
        var container = section.querySelector('#sr-reviews-list');
        if (!container) return;
        container.innerHTML = '<span class="sr-loading">' + t('loadingReviews') + '</span>';

        apiFetch('GET', 'reviews/' + itemId).then(function (reviews) {
            container.innerHTML = '';
            if (!reviews || !reviews.length) {
                container.innerHTML = '<p class="sr-no-reviews">' + t('noReviews') + '</p>';
                return;
            }

            var myId = currentUserId();
            var any = false;

            reviews.forEach(function (raw) {
                var review = {
                    id:         raw.id         ?? raw.Id,
                    userId:     raw.userId     ?? raw.UserId     ?? '',
                    userName:   raw.userName   ?? raw.UserName   ?? '—',
                    reviewText: raw.reviewText ?? raw.ReviewText ?? '',
                    userRating: raw.userRating ?? raw.UserRating ?? 0,
                    createdAt:  raw.createdAt  ?? raw.CreatedAt  ?? new Date().toISOString()
                };

                if (!review.reviewText || !review.reviewText.trim()) return;
                any = true;

                var isOwn = sameId(review.userId, myId);
                var date = '';
                try { date = new Date(review.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
                catch (_) {}

                var card = document.createElement('div');
                card.className = 'sr-review-card';
                card.dataset.reviewId = review.id;

                card.innerHTML =
                    '<div class="sr-review-header">' +
                        '<span class="sr-review-author">' + escHtml(review.userName) + '</span>' +
                        (review.userRating > 0 ? '<span class="sr-review-stars">' + starsHtml(review.userRating) + '</span>' : '') +
                        '<span class="sr-review-date">' + date + '</span>' +
                    '</div>' +
                    '<div class="sr-review-text">' + escHtml(review.reviewText) + '</div>' +
                    ((isOwn || pluginConfig.isAdmin) ? '<div class="sr-review-own-actions"></div>' : '');

                if (isOwn) {
                    var actions = card.querySelector('.sr-review-own-actions');
                    var editBtn = document.createElement('button');
                    editBtn.type = 'button';
                    editBtn.className = 'sr-edit-btn';
                    editBtn.textContent = t('edit');
                    editBtn.addEventListener('click', function () { openEditMode(card, review, section, itemId); });
                    actions.appendChild(editBtn);

                    var delBtn = document.createElement('button');
                    delBtn.type = 'button';
                    delBtn.className = 'sr-delete-btn';
                    delBtn.textContent = t('del');
                    delBtn.addEventListener('click', function () {
                        confirmDialog(t('confirmDeleteReview')).then(function (ok) {
                            if (!ok) return;
                            apiFetch('DELETE', 'review/' + review.id).then(function () {
                                renderReviews(section, itemId);
                                refreshSummary(section, itemId);
                            }).catch(function (err) { toast(explainError(err)); });
                        });
                    });
                    actions.appendChild(delBtn);
                } else if (pluginConfig.isAdmin) {
                    var actionsAdmin = card.querySelector('.sr-review-own-actions');
                    var adminBtn = document.createElement('button');
                    adminBtn.type = 'button';
                    adminBtn.className = 'sr-delete-btn sr-admin-action';
                    adminBtn.textContent = t('adminDelete');
                    adminBtn.addEventListener('click', function () {
                        confirmDialog(t('confirmDeleteReviewAdmin')).then(function (ok) {
                            if (!ok) return;
                            apiFetch('DELETE', 'admin/review/' + review.id).then(function () {
                                renderReviews(section, itemId);
                                refreshSummary(section, itemId);
                            }).catch(function (err) { toast(explainError(err)); });
                        });
                    });
                    actionsAdmin.appendChild(adminBtn);
                }

                container.appendChild(card);
            });

            if (!any) {
                container.innerHTML = '<p class="sr-no-reviews">' + t('noReviews') + '</p>';
            }
        }).catch(function () {
            container.innerHTML = '<p class="sr-no-reviews">' + t('loadingFailed') + '</p>';
        });
    }

    function openEditMode(card, review, section, itemId) {
        var textEl    = card.querySelector('.sr-review-text');
        var actionsEl = card.querySelector('.sr-review-own-actions');
        if (!textEl || !actionsEl) return;

        var max = pluginConfig.maxReviewLength;
        textEl.innerHTML = '<textarea class="sr-edit-textarea" maxlength="' + max + '">' + escHtml(review.reviewText) + '</textarea>';
        actionsEl.innerHTML =
            '<button type="button" class="sr-submit-btn sr-save-btn">' + t('save') + '</button>' +
            '<button type="button" class="sr-edit-btn sr-cancel-btn">' + t('cancel') + '</button>';

        actionsEl.querySelector('.sr-cancel-btn').addEventListener('click', function () { renderReviews(section, itemId); });
        actionsEl.querySelector('.sr-save-btn').addEventListener('click', function () {
            var newText = card.querySelector('.sr-edit-textarea').value.trim();
            apiFetch('PUT', 'review/' + review.id, { reviewText: newText }).then(function () {
                renderReviews(section, itemId);
            }).catch(function (err) { toast(explainError(err)); });
        });
    }

    function initReviewForm(section, itemId, shared) {
        var form      = section.querySelector('#sr-review-form');
        var textarea  = section.querySelector('#sr-review-text');
        var charCount = section.querySelector('#sr-char-count');
        var submitBtn = section.querySelector('#sr-submit-review');
        if (!form || !textarea || !charCount || !submitBtn) return;

        if (!pluginConfig.allowSelfReview) {
            form.style.display = 'none';
        } else {
            form.style.display = '';
        }

        var max = pluginConfig.maxReviewLength;
        textarea.maxLength = max;
        charCount.textContent = '0 / ' + max;

        function findMyReview(reviews) {
            var myId = currentUserId();
            return (reviews || []).find(function (r) {
                var uid = r.userId ?? r.UserId ?? '';
                return sameId(uid, myId);
            });
        }

        var loadToken = shared.reviewToken;
        apiFetch('GET', 'reviews/' + itemId).then(function (reviews) {
            if (loadToken !== shared.reviewToken) return;
            var mine = findMyReview(reviews);
            if (mine) {
                shared.reviewId = mine.id ?? mine.Id;
                textarea.value = mine.reviewText ?? mine.ReviewText ?? '';
                charCount.textContent = textarea.value.length + ' / ' + max;
                submitBtn.textContent = t('update');
            }
        }).catch(function () {});

        textarea.addEventListener('input', function () {
            charCount.textContent = textarea.value.length + ' / ' + max;
        });

        submitBtn.addEventListener('click', function () {
            var text = textarea.value.trim();
            submitBtn.disabled = true;

            var ratingRequest = shared.draftRating > 0
                ? apiFetch('POST', 'rating', { itemId: itemId, rating: shared.draftRating })
                : Promise.resolve();

            var reviewRequest = shared.reviewId
                ? apiFetch('PUT', 'review/' + shared.reviewId, { reviewText: text })
                : apiFetch('POST', 'review', { itemId: itemId, reviewText: text });

            if (shared.reviewId) {
                reviewRequest = reviewRequest.catch(function (err) {
                    var status = err && (err.status || (err.response && err.response.status));
                    if (status === 404) {
                        shared.reviewId = null;
                        return apiFetch('POST', 'review', { itemId: itemId, reviewText: text });
                    }
                    throw err;
                });
            }

            ratingRequest
                .then(function () { return reviewRequest; })
                .then(function () {
                    submitBtn.disabled = false;
                    submitBtn.textContent = t('update');

                    if (shared.draftRating > 0) {
                        shared.currentRating = shared.draftRating;
                        updateStarSlots(section.querySelector('#sr-stars-input'), shared.currentRating);

                        var label = section.querySelector('#sr-rating-label');
                        var delBtn = section.querySelector('#sr-delete-rating');
                        if (label) label.textContent = t('yourRatingValue', shared.currentRating);
                        if (delBtn) delBtn.style.display = 'inline-block';
                        setCachedPosterRating(itemId, shared.currentRating);
                    }

                    if (!shared.reviewId) {
                        apiFetch('GET', 'reviews/' + itemId).then(function (reviews) {
                            var mine = findMyReview(reviews);
                            if (mine) shared.reviewId = mine.id ?? mine.Id;
                        }).catch(function () {});
                    }

                    renderReviews(section, itemId);
                    refreshSummary(section, itemId);
                    loadMyRatings(true);
                })
                .catch(function (err) {
                    submitBtn.disabled = false;
                    toast(explainError(err));
                });
        });
    }

    function tryInjectDetailSection() {
        var itemId = getDetailItemId();
        if (!itemId) return false;

        var page = document.querySelector('#itemDetailPage:not(.hide)');
        if (!page) return false;

        var anchor = page.querySelector('.detailPageContent') || page;
        var key = normalizeItemId(itemId);
        var cachedType = itemTypeCache[key];

        if (cachedType === undefined) {
            loadItemType(itemId).then(function () {
                if (sameId(getDetailItemId(), itemId)) tryInjectDetailSection();
            });
            return false;
        }

        if (!isRateableItemType(cachedType)) {
            var existing0 = document.getElementById('starrating-section');
            if (existing0) existing0.remove();
            return true;
        }

        var existing = document.getElementById('starrating-section');
        if (existing) {
            if (existing.dataset.itemId === itemId && anchor.contains(existing)) {
                return true;
            }
            existing.remove();
        }

        var section = buildDetailSection();
        section.dataset.itemId = itemId;
        anchor.appendChild(section);

        var shared = { reviewId: null, reviewToken: 0, currentRating: 0, draftRating: 0 };

        refreshSummary(section, itemId);
        apiFetch('GET', 'rating/' + itemId)
            .then(function (data) { renderStarsInput(section, itemId, data ? (data.rating ?? data.Rating ?? 0) : 0, shared); })
            .catch(function ()    { renderStarsInput(section, itemId, 0, shared); });
        initReviewForm(section, itemId, shared);
        renderReviews(section, itemId);
        return true;
    }

    // ── Page d'accueil StarRating ────────────────────────────────────────────

    var starRatingHomeActive = false;
    var starRatingItems = [];
    var starRatingLoading = false;
    var starRatingTab = 'list';
    var toolExportFormat = 'json';
    var toolImportFormat = 'json';

    function buildFormatToggleHtml(toggleId, currentFormat) {
        var isCsv = currentFormat === 'csv';
        return '<div class="sr-format-toggle" id="' + toggleId + '" role="group">' +
            '<button type="button" class="sr-format-btn' + (isCsv ? '' : ' sr-format-btn-active') + '" data-format="json">' + t('formatJson') + '</button>' +
            '<button type="button" class="sr-format-btn' + (isCsv ? ' sr-format-btn-active' : '') + '" data-format="csv">' + t('formatCsv') + '</button>' +
            '</div>';
    }

    function bindFormatToggle(section, toggleId, getFormat, setFormat, onFormatChange) {
        var toggle = section.querySelector('#' + toggleId);
        if (!toggle) return;

        function applyFormat(format) {
            var fmt = format === 'csv' ? 'csv' : 'json';
            toggle.querySelectorAll('.sr-format-btn').forEach(function (btn) {
                btn.classList.toggle('sr-format-btn-active', btn.dataset.format === fmt);
            });
            setFormat(fmt);
            if (onFormatChange) onFormatChange(fmt);
        }

        applyFormat(getFormat());
        toggle.querySelectorAll('.sr-format-btn').forEach(function (btn) {
            btn.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                applyFormat(btn.dataset.format);
            });
        });
    }

    function isOnHomePage() {
        var hash = window.location.hash || '';
        var clean = hash.replace(/^#!?\/?/, '').replace(/^!?\/?/, '');
        if (clean === '' || clean === 'home' || clean.indexOf('home?') === 0 || clean.indexOf('home/') === 0) {
            return true;
        }
        return false;
    }

    function findFavoritesTab() {
        if (!isOnHomePage()) return null;

        var buttons = Array.prototype.slice.call(document.querySelectorAll('button, a'));
        return buttons.find(function (el) {
            var text = (el.textContent || '').trim();
            return /^Favoris$/i.test(text) || /^Favorites$/i.test(text);
        });
    }

    function buildStarRatingTab(referenceTab) {
        var tag = referenceTab && referenceTab.tagName ? referenceTab.tagName.toLowerCase() : 'button';
        var tab = document.createElement(tag);
        tab.className = referenceTab ? referenceTab.className : '';
        tab.classList.add('sr-home-tab');
        tab.removeAttribute('id');
        tab.removeAttribute('data-index');
        tab.removeAttribute('data-tab');
        tab.setAttribute('type', 'button');
        tab.innerHTML = '<span class="sr-home-tab-icon">★</span><span>' + t('tabHome') + '</span>';
        tab.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            showStarRatingHome();
        });
        return tab;
    }

    function injectStarRatingHomeTab() {
        var existingTab = document.querySelector('.sr-home-tab');

        if (!isOnHomePage()) {
            if (existingTab) existingTab.remove();
            return;
        }

        var fav = findFavoritesTab();

        if (existingTab && fav && fav.parentNode && fav.parentNode.contains(existingTab)) {
            return;
        }

        if (existingTab) existingTab.remove();
        if (!fav || !fav.parentNode) return;

        fav.parentNode.insertBefore(buildStarRatingTab(fav), fav.nextSibling);
    }

    function setNativeHomeTabsInactive(inactive) {
        var tab = document.querySelector('.sr-home-tab');
        var parent = tab && tab.parentNode;
        if (!parent) return;

        parent.querySelectorAll('button, a').forEach(function (nativeTab) {
            if (!nativeTab.classList.contains('sr-home-tab')) {
                nativeTab.classList.toggle('sr-home-native-inactive', inactive);
            }
        });
    }

    function buildHomePageMarkup() {
        var typeOptions = '<option value="">' + t('all') + '</option>';
        if (pluginConfig.allowedTypeMovie)  typeOptions += '<option value="Movie">' + t('typeMovie') + '</option>';
        if (pluginConfig.allowedTypeSeries) typeOptions += '<option value="Series">' + t('typeSeries') + '</option>';

        var minOptions = '<option value="0">' + t('allF') + '</option>';
        var maxOptions = '';
        for (var v = 0.5; v <= 5; v += 0.5) {
            minOptions += '<option value="' + v + '">' + v + '</option>';
            maxOptions = '<option value="' + v + '">' + v + '</option>' + maxOptions;
        }

        var adminTab = '';

        return '' +
            '<div class="sr-home-header">' +
                '<div>' +
                    '<h1>' + t('homeTitle') + '</h1>' +
                    '<p>' + t('homeSubtitle') + '</p>' +
                '</div>' +
            '</div>' +
            '<div class="sr-home-pills">' +
                '<button type="button" class="sr-home-pill sr-home-pill-active" data-tab="list">' + t('tabHome') + '</button>' +
                '<button type="button" class="sr-home-pill" data-tab="stats">' + t('statsSection') + '</button>' +
                '<button type="button" class="sr-home-pill" data-tab="tools">' + t('toolsSection') + '</button>' +
                adminTab +
            '</div>' +

            '<section class="sr-home-tab-panel" data-panel="list">' +
                '<div class="sr-home-filters">' +
                    '<label>' + t('search') +
                        '<input id="sr-filter-search" type="search" placeholder="' + t('search') + '..." />' +
                    '</label>' +
                    '<label>' + t('ratingMin') +
                        '<select id="sr-filter-min">' + minOptions + '</select>' +
                    '</label>' +
                    '<label>' + t('ratingMax') +
                        '<select id="sr-filter-max"><option value="5">5</option>' + maxOptions + '</select>' +
                    '</label>' +
                    '<label>' + t('type') +
                        '<select id="sr-filter-type">' + typeOptions + '</select>' +
                    '</label>' +
                    '<label>' + t('sortBy') +
                        '<select id="sr-filter-sort">' +
                            '<option value="rating-desc">' + t('sortRatingDesc') + '</option>' +
                            '<option value="rating-asc">' + t('sortRatingAsc') + '</option>' +
                            '<option value="date-desc">' + t('sortDateDesc') + '</option>' +
                            '<option value="date-asc">' + t('sortDateAsc') + '</option>' +
                            '<option value="title-asc">' + t('sortTitleAsc') + '</option>' +
                        '</select>' +
                    '</label>' +
                '</div>' +
                '<div class="sr-home-count" id="sr-home-count"></div>' +
                '<div class="sr-rated-grid" id="sr-rated-grid"></div>' +
            '</section>' +

            '<section class="sr-home-tab-panel sr-hidden" data-panel="stats">' +
                '<div id="sr-stats-container" class="sr-stats-container">' +
                    '<div class="sr-home-loading">' + t('loading') + '</div>' +
                '</div>' +
            '</section>' +

            '<section class="sr-home-tab-panel sr-hidden" data-panel="tools">' +
                '<p class="sr-data-note">' + t('dataPersistenceNote') + '</p>' +
                '<div class="sr-tools-container">' +
                    '<div class="sr-tool-card">' +
                        '<h3>' + t('export') + '</h3>' +
                        '<p>' + t('homeSubtitle') + '</p>' +
                        '<div class="sr-tool-label">' + t('exportFormat') +
                            buildFormatToggleHtml('sr-export-format-toggle', toolExportFormat) +
                        '</div>' +
                        '<button type="button" class="sr-submit-btn" id="sr-export-btn">' + t('export') + '</button>' +
                    '</div>' +
                    '<div class="sr-tool-card">' +
                        '<h3>' + t('import') + '</h3>' +
                        '<div class="sr-tool-label">' + t('importFormat') +
                            buildFormatToggleHtml('sr-import-format-toggle', toolImportFormat) +
                        '</div>' +
                        '<label class="sr-import-label">' +
                            '<input type="file" id="sr-import-file" accept="application/json,.json,text/csv,.csv" />' +
                            '<span id="sr-import-file-name">' + t('importFileLabel') + '</span>' +
                        '</label>' +
                        '<label class="sr-import-mode"><input type="radio" name="sr-import-mode" value="merge" checked /> ' + t('importMerge') + '</label>' +
                        '<label class="sr-import-mode"><input type="radio" name="sr-import-mode" value="overwrite" /> ' + t('importOverwrite') + '</label>' +
                        '<button type="button" class="sr-submit-btn" id="sr-import-btn" disabled>' + t('import') + '</button>' +
                    '</div>' +
                '</div>' +
            '</section>' +

            '';
    }

    function bindHomePageEvents(section) {
        if (!section || section.dataset.bound === '1') return;
        section.dataset.bound = '1';

        section.querySelectorAll('#sr-filter-search, #sr-filter-min, #sr-filter-max, #sr-filter-type, #sr-filter-sort').forEach(function (input) {
            input.addEventListener('input', renderHomeItems);
            input.addEventListener('change', renderHomeItems);
        });

        section.querySelectorAll('.sr-home-pill').forEach(function (pill) {
            pill.addEventListener('click', function () { selectHomeTab(pill.dataset.tab); });
        });

        var exportBtn = section.querySelector('#sr-export-btn');
        bindFormatToggle(section, 'sr-export-format-toggle', function () { return toolExportFormat; }, function (fmt) {
            toolExportFormat = fmt;
        });
        if (exportBtn) exportBtn.addEventListener('click', exportRatings);

        var importBtn = section.querySelector('#sr-import-btn');
        var fileInput = section.querySelector('#sr-import-file');
        var fileNameLabel = section.querySelector('#sr-import-file-name');
        function updateImportFileName() {
            var file = fileInput.files && fileInput.files[0];
            if (fileNameLabel) fileNameLabel.textContent = file ? file.name : t('importFileLabel');
            importBtn.disabled = !file;
        }
        if (importBtn && fileInput) {
            fileInput.accept = toolImportFormat === 'csv' ? '.csv,text/csv' : '.json,application/json';
            fileInput.addEventListener('change', updateImportFileName);
            bindFormatToggle(section, 'sr-import-format-toggle', function () { return toolImportFormat; }, function (fmt) {
                toolImportFormat = fmt;
            }, function (fmt) {
                fileInput.value = '';
                fileInput.accept = fmt === 'csv' ? '.csv,text/csv' : '.json,application/json';
                updateImportFileName();
            });
            importBtn.addEventListener('click', function () { importRatings(fileInput, section); });
        }

        section.querySelectorAll('.sr-tools-container button, .sr-tools-container input, .sr-tools-container label').forEach(function (el) {
            el.addEventListener('mousedown', function (event) { event.stopPropagation(); });
            el.addEventListener('click', function (event) { event.stopPropagation(); });
        });
    }

    function selectHomeTab(name) {
        starRatingTab = name;
        var section = document.getElementById('starrating-home-page');
        if (!section) return;

        section.querySelectorAll('.sr-home-pill').forEach(function (pill) {
            pill.classList.toggle('sr-home-pill-active', pill.dataset.tab === name);
        });

        section.querySelectorAll('.sr-home-tab-panel').forEach(function (panel) {
            panel.classList.toggle('sr-hidden', panel.dataset.panel !== name);
        });

        if (name === 'stats') loadStats();
        if (name === 'admin') loadAdminReviews();
    }

    var HOME_PAGE_VERSION = '3';

    function ensureHomePage() {
        var existing = document.getElementById('starrating-home-page');
        if (existing && existing.dataset.pageVersion !== HOME_PAGE_VERSION) {
            existing.remove();
            existing = null;
        }
        if (!existing) {
            existing = document.createElement('section');
            existing.id = 'starrating-home-page';
            existing.className = 'sr-home-page';
            existing.dataset.pageVersion = HOME_PAGE_VERSION;
            existing.innerHTML = buildHomePageMarkup();
            bindHomePageEvents(existing);
        }
        if (existing.parentElement !== document.body) {
            document.body.appendChild(existing);
        }
        return existing;
    }

    function getAppChromeBottom() {
        var bottom = 0;
        document.querySelectorAll('.skinHeader, .headerTabs').forEach(function (el) {
            if (!el.offsetParent && el !== document.body) return;
            var rect = el.getBoundingClientRect();
            if (rect.bottom > bottom) bottom = rect.bottom;
        });
        return Math.ceil(bottom) || 110;
    }

    function updateHomeLayout() {
        var section = document.getElementById('starrating-home-page');
        if (!section) return;
        section.style.top = getAppChromeBottom() + 'px';
    }

    function setHomeVisible(visible) {
        var section = ensureHomePage();
        if (visible) updateHomeLayout();
        section.classList.toggle('sr-home-page-visible', visible);

        var tab = document.querySelector('.sr-home-tab');
        if (tab) tab.classList.toggle('sr-home-tab-active', visible);
        setNativeHomeTabsInactive(visible);
    }

    function showStarRatingHome() {
        starRatingHomeActive = true;
        setHomeVisible(true);
        selectHomeTab('list');
        loadHomeItems(true);
        window.addEventListener('resize', updateHomeLayout);
    }

    function hideStarRatingHome() {
        starRatingHomeActive = false;
        window.removeEventListener('resize', updateHomeLayout);
        var page = document.getElementById('starrating-home-page');
        if (page) page.classList.remove('sr-home-page-visible');

        var tab = document.querySelector('.sr-home-tab');
        if (tab) tab.classList.remove('sr-home-tab-active');
        setNativeHomeTabsInactive(false);
    }

    function handleNavigationClick(event) {
        if (!starRatingHomeActive) return;
        var target = event.target;
        if (!target || !target.closest) return;
        if (target.closest('#starrating-home-page') || target.closest('.sr-home-tab')) return;
        if (target.closest('select, option, input, textarea, label, .sr-tools-container, .sr-tool-card, .sr-format-toggle')) return;

        /* Bouton menu / en-tête : ne pas fermer l'onglet ni bloquer le tiroir latéral */
        if (target.closest('.skinHeader') && !target.closest('.headerTabs button, .headerTabs a')) return;

        var nativeTab = target.closest('.headerTabs button, .headerTabs a');
        var menuItem  = target.closest('.navMenuOption, .mainDrawer a[href^="#!/"], .mainDrawer a[href^="#/"]');

        if (nativeTab || menuItem) {
            hideStarRatingHome();
        }
    }

    function loadHomeItems(force) {
        var grid = document.getElementById('sr-rated-grid');
        if (!grid || starRatingLoading) return;
        if (!force && starRatingItems.length) {
            renderHomeItems();
            return;
        }

        starRatingLoading = true;
        grid.innerHTML = '<div class="sr-home-loading">' + t('loading') + '</div>';

        apiFetch('GET', 'my-ratings').then(function (ratings) {
            ratings = ratings || [];
            if (!ratings.length) {
                starRatingItems = [];
                renderHomeItems();
                return;
            }

            var ids = ratings.map(function (r) { return r.itemId ?? r.ItemId; }).filter(Boolean);
            return loadJellyfinItems(ids).then(function (items) {
                var byId = {};
                (items || []).forEach(function (item) {
                    byId[normalizeItemId(item.Id || item.id)] = item;
                });

                starRatingItems = ratings.map(function (rating) {
                    var itemId = rating.itemId ?? rating.ItemId;
                    var key = normalizeItemId(itemId);
                    var item = byId[key] || { Id: itemId, Name: t('mediaUnknown') };
                    return {
                        itemId: itemId,
                        rating: rating.rating ?? rating.Rating ?? 0,
                        updatedAt: rating.updatedAt ?? rating.UpdatedAt,
                        item: item
                    };
                }).filter(function (entry) {
                    return isRateableItemType(itemTypeFromItem(entry.item));
                });

                renderHomeItems();
            });
        }).catch(function () {
            grid.innerHTML = '<div class="sr-home-empty">' + t('cannotLoadRatings') + '</div>';
        }).finally(function () {
            starRatingLoading = false;
        });
    }

    function renderHomeItems() {
        var grid = document.getElementById('sr-rated-grid');
        var count = document.getElementById('sr-home-count');
        if (!grid) return;

        var search = ((document.getElementById('sr-filter-search') || {}).value || '').trim().toLowerCase();
        var min = parseFloat(((document.getElementById('sr-filter-min') || {}).value) || '0');
        var max = parseFloat(((document.getElementById('sr-filter-max') || {}).value) || '5');
        var type = ((document.getElementById('sr-filter-type') || {}).value) || '';
        var sort = ((document.getElementById('sr-filter-sort') || {}).value) || 'rating-desc';

        var filtered = starRatingItems.filter(function (entry) {
            var item = entry.item || {};
            var title = (item.Name || item.name || '').toLowerCase();
            var itemType = item.Type || item.type || '';
            return isRateableItemType(itemType) &&
                entry.rating >= min &&
                entry.rating <= max &&
                (!type || itemType === type) &&
                (!search || title.indexOf(search) !== -1);
        });

        filtered.sort(function (a, b) {
            var aTitle = (a.item.Name || a.item.name || '');
            var bTitle = (b.item.Name || b.item.name || '');
            if (sort === 'rating-asc')  return a.rating - b.rating;
            if (sort === 'date-desc')   return new Date(b.updatedAt) - new Date(a.updatedAt);
            if (sort === 'date-asc')    return new Date(a.updatedAt) - new Date(b.updatedAt);
            if (sort === 'title-asc')   return aTitle.localeCompare(bTitle);
            return b.rating - a.rating;
        });

        if (count) count.textContent = t('results', filtered.length);

        if (!filtered.length) {
            grid.innerHTML = '<div class="sr-home-empty">' + t('noResults') + '</div>';
            return;
        }

        grid.innerHTML = filtered.map(renderRatedCard).join('');
    }

    function renderRatedCard(entry) {
        var item = entry.item || {};
        var id = item.Id || item.id || entry.itemId;
        var title = item.Name || item.name || t('mediaUnknown');
        var year = item.ProductionYear || item.productionYear;
        var type = item.Type || item.type || '';
        var typeLabel = type === 'Movie' ? t('typeMovie') : (type === 'Series' ? t('typeSeries') : type);
        var image = ApiClient.getUrl('Items/' + id + '/Images/Primary?fillHeight=360&fillWidth=240&quality=90');
        var updated = '';
        try { if (entry.updatedAt) updated = new Date(entry.updatedAt).toLocaleDateString(undefined); } catch (_) {}

        return '' +
            '<a class="sr-rated-card" href="#!/details?id=' + encodeURIComponent(id) + '">' +
                '<div class="sr-rated-poster" style="background-image:url(\'' + image + '\')">' +
                    '<div class="sr-poster-badge"><span class="sr-star">★</span>' + entry.rating + '/5</div>' +
                '</div>' +
                '<div class="sr-rated-title">' + escHtml(title) + '</div>' +
                '<div class="sr-rated-meta">' +
                    (typeLabel ? '<span>' + escHtml(typeLabel) + '</span>' : '') +
                    (year ? '<span>' + year + '</span>' : '') +
                    (updated ? '<span>' + t('ratedOn', updated) + '</span>' : '') +
                '</div>' +
            '</a>';
    }

    // ── Statistiques ──────────────────────────────────────────────────────────

    function loadStats() {
        var container = document.getElementById('sr-stats-container');
        if (!container) return;
        container.innerHTML = '<div class="sr-home-loading">' + t('loading') + '</div>';

        apiFetch('GET', 'stats').then(function (raw) {
            renderStats(raw || {});
        }).catch(function () {
            container.innerHTML = '<div class="sr-home-empty">' + t('cannotLoadRatings') + '</div>';
        });
    }

    function renderStats(raw) {
        var container = document.getElementById('sr-stats-container');
        if (!container) return;

        var total       = raw.totalRatings ?? raw.TotalRatings ?? 0;
        var reviews     = raw.totalReviews ?? raw.TotalReviews ?? 0;
        var avg         = raw.averageRating ?? raw.AverageRating ?? 0;
        var highest     = raw.highestRating ?? raw.HighestRating;
        var lowest      = raw.lowestRating ?? raw.LowestRating;
        var distribution = (raw.distribution ?? raw.Distribution ?? []);

        var distMap = {};
        distribution.forEach(function (d) {
            var bucket = d.bucket ?? d.Bucket;
            var cnt    = d.count ?? d.Count;
            distMap[bucket] = cnt;
        });

        var maxCount = 0;
        for (var b = 0.5; b <= 5; b += 0.5) {
            if ((distMap[b] || 0) > maxCount) maxCount = distMap[b];
        }

        var bars = '';
        for (var v = 5; v >= 0.5; v -= 0.5) {
            var c = distMap[v] || 0;
            var pct = maxCount ? Math.round(c / maxCount * 100) : 0;
            bars += '<div class="sr-bar-row">' +
                        '<span class="sr-bar-label">' + v + '</span>' +
                        '<div class="sr-bar-track"><div class="sr-bar-fill" style="width:' + pct + '%"></div></div>' +
                        '<span class="sr-bar-count">' + c + '</span>' +
                    '</div>';
        }

        container.innerHTML =
            '<div class="sr-stats-grid">' +
                '<div class="sr-stat-card"><div class="sr-stat-value">' + total + '</div><div class="sr-stat-label">' + t('statTotalRatings') + '</div></div>' +
                '<div class="sr-stat-card"><div class="sr-stat-value">' + reviews + '</div><div class="sr-stat-label">' + t('statTotalReviews') + '</div></div>' +
                '<div class="sr-stat-card"><div class="sr-stat-value">' + Number(avg || 0).toFixed(2) + '</div><div class="sr-stat-label">' + t('statAverage') + '</div></div>' +
                '<div class="sr-stat-card"><div class="sr-stat-value">' + (highest != null ? Number(highest).toFixed(1) : '–') + '</div><div class="sr-stat-label">' + t('statHighest') + '</div></div>' +
                '<div class="sr-stat-card"><div class="sr-stat-value">' + (lowest != null ? Number(lowest).toFixed(1) : '–') + '</div><div class="sr-stat-label">' + t('statLowest') + '</div></div>' +
            '</div>' +
            '<h3 class="sr-stats-subtitle">' + t('distribution') + '</h3>' +
            '<div class="sr-bars">' + bars + '</div>';
    }

    // ── Export / Import ──────────────────────────────────────────────────────

    function selectedToolFormat(section, id) {
        var toggleId = id === '#sr-export-format' ? '#sr-export-format-toggle' : '#sr-import-format-toggle';
        var toggle = section ? section.querySelector(toggleId) : document.querySelector(toggleId);
        if (toggle) {
            var active = toggle.querySelector('.sr-format-btn-active');
            if (active && active.dataset.format === 'csv') return 'csv';
            if (active && active.dataset.format === 'json') return 'json';
        }
        if (id === '#sr-export-format') return toolExportFormat;
        if (id === '#sr-import-format') return toolImportFormat;
        return 'json';
    }

    function downloadText(filename, content, mimeType) {
        var blob = new Blob([content], { type: mimeType });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function csvCell(value) {
        var text = value == null ? '' : String(value);
        if (/[",\r\n]/.test(text)) {
            return '"' + text.replace(/"/g, '""') + '"';
        }
        return text;
    }

    function formatExportDate(value) {
        if (!value) return '';
        var date = value instanceof Date ? value : new Date(value);
        if (isNaN(date.getTime())) return String(value);
        return [
            String(date.getDate()).padStart(2, '0'),
            String(date.getMonth() + 1).padStart(2, '0'),
            date.getFullYear()
        ].join('/');
    }

    function exportDateToIso(value) {
        var text = String(value || '').trim();
        if (!text) return new Date().toISOString();

        var french = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (french) {
            return new Date(Date.UTC(
                parseInt(french[3], 10),
                parseInt(french[2], 10) - 1,
                parseInt(french[1], 10)
            )).toISOString();
        }

        var date = new Date(text);
        return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
    }

    function exportValue(entry, name) {
        return entry ? (entry[name] ?? entry[name.charAt(0).toUpperCase() + name.slice(1)]) : '';
    }

    function exportItemName(item) {
        if (!item) return '';
        var name = item.Name || item.name || '';
        var year = item.ProductionYear || item.productionYear || '';
        return year ? name + ' (' + year + ')' : name;
    }

    function buildExportRows(payload, itemsById) {
        var ratings = payload && (payload.Ratings || payload.ratings) || [];
        var reviews = payload && (payload.Reviews || payload.reviews) || [];
        var byId = {};

        ratings.forEach(function (rating) {
            var itemId = exportValue(rating, 'itemId');
            var key = normalizeItemId(itemId);
            if (!key) return;
            byId[key] = byId[key] || { itemId: itemId };
            byId[key].rating = exportValue(rating, 'rating');
            byId[key].ratingCreatedAt = exportValue(rating, 'createdAt');
            byId[key].ratingUpdatedAt = exportValue(rating, 'updatedAt');
        });

        reviews.forEach(function (review) {
            var itemId = exportValue(review, 'itemId');
            var key = normalizeItemId(itemId);
            if (!key) return;
            byId[key] = byId[key] || { itemId: itemId };
            byId[key].reviewText = exportValue(review, 'reviewText');
            byId[key].reviewCreatedAt = exportValue(review, 'createdAt');
            byId[key].reviewUpdatedAt = exportValue(review, 'updatedAt');
        });

        return Object.keys(byId).map(function (key) {
            var row = byId[key];
            var item = itemsById && itemsById[key];
            row.title = exportItemName(item) || exportValue(row, 'itemName') || t('mediaUnknown');
            row.type = item ? (item.Type || item.type || '') : '';
            row.year = item ? (item.ProductionYear || item.productionYear || '') : '';
            row.sortName = item ? (item.SortName || item.sortName || row.title) : row.title;
            return row;
        }).sort(function (a, b) {
            return String(a.sortName || a.title || '').localeCompare(String(b.sortName || b.title || ''), undefined, { sensitivity: 'base' });
        });
    }

    function enrichExportPayload(payload) {
        payload = payload || {};
        var ratings = payload.Ratings || payload.ratings || [];
        var reviews = payload.Reviews || payload.reviews || [];
        var ids = [];
        var seen = {};

        ratings.concat(reviews).forEach(function (entry) {
            var itemId = exportValue(entry, 'itemId');
            var key = normalizeItemId(itemId);
            if (!key || seen[key]) return;
            seen[key] = true;
            ids.push(itemId);
        });

        return loadJellyfinItems(ids).then(function (items) {
            var itemsById = {};
            (items || []).forEach(function (item) {
                itemsById[normalizeItemId(item.Id || item.id)] = item;
            });

            return { payload: payload, rows: buildExportRows(payload, itemsById) };
        });
    }

    function exportPayloadToJson(rows, sourcePayload) {
        return {
            Version: '2',
            ExportedAt: formatExportDate((sourcePayload || {}).ExportedAt || (sourcePayload || {}).exportedAt || new Date()),
            Items: (rows || []).map(function (row) {
                return {
                    Titre: row.title || '',
                    Note: row.rating === undefined || row.rating === null ? null : row.rating,
                    Commentaire: row.reviewText || '',
                    Type: row.type || '',
                    Annee: row.year || '',
                    ItemId: row.itemId || '',
                    NoteCreee: formatExportDate(row.ratingCreatedAt),
                    CommentaireCree: formatExportDate(row.reviewCreatedAt)
                };
            })
        };
    }

    function exportPayloadToCsv(rows) {
        var csvRows = [['Titre', 'Note', 'Commentaire', 'Type', 'Annee', 'ItemId', 'NoteCreee', 'CommentaireCree']];

        (rows || []).forEach(function (row) {
            csvRows.push([
                row.title || '',
                row.rating === undefined || row.rating === null ? '' : row.rating,
                row.reviewText || '',
                row.type || '',
                row.year || '',
                row.itemId || '',
                formatExportDate(row.ratingCreatedAt),
                formatExportDate(row.reviewCreatedAt)
            ]);
        });

        return csvRows.map(function (row) {
            return row.map(csvCell).join(',');
        }).join('\n');
    }

    function parseCsv(text) {
        var rows = [];
        var row = [];
        var cell = '';
        var inQuotes = false;

        for (var i = 0; i < text.length; i++) {
            var ch = text[i];
            var next = text[i + 1];

            if (inQuotes) {
                if (ch === '"' && next === '"') {
                    cell += '"';
                    i++;
                } else if (ch === '"') {
                    inQuotes = false;
                } else {
                    cell += ch;
                }
                continue;
            }

            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                row.push(cell);
                cell = '';
            } else if (ch === '\n') {
                row.push(cell);
                rows.push(row);
                row = [];
                cell = '';
            } else if (ch !== '\r') {
                cell += ch;
            }
        }

        row.push(cell);
        if (row.some(function (value) { return value !== ''; })) rows.push(row);
        return rows;
    }

    function csvToImportPayload(text, overwrite) {
        var rows = parseCsv(text);
        if (!rows.length) return { ratings: [], reviews: [], overwrite: overwrite };

        var headers = rows.shift().map(function (h) { return String(h || '').trim().toLowerCase(); });
        function get(row, name) {
            var idx = headers.indexOf(name.toLowerCase());
            return idx >= 0 ? row[idx] : '';
        }
        function first(row, names) {
            for (var i = 0; i < names.length; i++) {
                var value = get(row, names[i]);
                if (value !== '') return value;
            }
            return '';
        }

        var ratings = [];
        var reviews = [];

        rows.forEach(function (row) {
            var type = String(get(row, 'type') || '').trim().toLowerCase();
            var itemId = String(first(row, ['ItemId', 'itemid']) || '').trim();
            if (!itemId) return;

            if (type === 'rating') {
                var ratingValue = parseFloat(first(row, ['rating', 'Note']));
                if (!ratingValue) return;
                ratings.push({
                    itemId: itemId,
                    rating: ratingValue,
                    createdAt: exportDateToIso(first(row, ['createdAt', 'NoteCreee', 'NoteCreeeLe'])),
                    updatedAt: exportDateToIso(first(row, ['updatedAt', 'NoteModifieeLe', 'NoteCreee', 'NoteCreeeLe']))
                });
            } else if (type === 'review') {
                reviews.push({
                    itemId: itemId,
                    reviewText: first(row, ['reviewText', 'Commentaire']) || '',
                    createdAt: exportDateToIso(first(row, ['createdAt', 'CommentaireCree', 'AvisCreeLe'])),
                    updatedAt: exportDateToIso(first(row, ['updatedAt', 'AvisModifieLe', 'CommentaireCree', 'AvisCreeLe']))
                });
            } else {
                var combinedRating = parseFloat(first(row, ['rating', 'Note']));
                var combinedReview = first(row, ['reviewText', 'Commentaire']);
                if (combinedRating) {
                    ratings.push({
                        itemId: itemId,
                        rating: combinedRating,
                        createdAt: exportDateToIso(first(row, ['NoteCreee', 'NoteCreeeLe', 'createdAt'])),
                        updatedAt: exportDateToIso(first(row, ['NoteModifieeLe', 'updatedAt', 'NoteCreee', 'NoteCreeeLe']))
                    });
                }
                if (combinedReview) {
                    reviews.push({
                        itemId: itemId,
                        reviewText: combinedReview,
                        createdAt: exportDateToIso(first(row, ['CommentaireCree', 'AvisCreeLe', 'createdAt'])),
                        updatedAt: exportDateToIso(first(row, ['AvisModifieLe', 'updatedAt', 'CommentaireCree', 'AvisCreeLe']))
                    });
                }
            }
        });

        return { ratings: ratings, reviews: reviews, overwrite: overwrite };
    }

    function jsonToImportPayload(json, overwrite) {
        var items = json.Items || json.items || [];
        if (!items.length) {
            return {
                ratings: (json.Ratings || json.ratings || []),
                reviews: (json.Reviews || json.reviews || []),
                overwrite: overwrite
            };
        }

        var ratings = [];
        var reviews = [];
        items.forEach(function (item) {
            var itemId = item.ItemId || item.itemId || '';
            if (!itemId) return;

            var rating = item.Note ?? item.Rating ?? item.rating;
            if (rating !== undefined && rating !== null && rating !== '') {
                ratings.push({
                    itemId: itemId,
                    rating: parseFloat(rating),
                    createdAt: exportDateToIso(item.NoteCreee || item.NoteCreeeLe || item.RatingCreatedAt || item.createdAt),
                    updatedAt: exportDateToIso(item.NoteModifieeLe || item.RatingUpdatedAt || item.updatedAt || item.NoteCreee || item.NoteCreeeLe)
                });
            }

            var reviewText = item.Commentaire ?? item.ReviewText ?? item.reviewText ?? '';
            if (reviewText) {
                reviews.push({
                    itemId: itemId,
                    reviewText: reviewText,
                    createdAt: exportDateToIso(item.CommentaireCree || item.AvisCreeLe || item.ReviewCreatedAt || item.createdAt),
                    updatedAt: exportDateToIso(item.AvisModifieLe || item.ReviewUpdatedAt || item.updatedAt || item.CommentaireCree || item.AvisCreeLe)
                });
            }
        });

        return { ratings: ratings, reviews: reviews, overwrite: overwrite };
    }

    function importPayloadCounts(body) {
        var ratings = body && (body.ratings || body.Ratings) || [];
        var reviews = body && (body.reviews || body.Reviews) || [];
        return { ratings: ratings.length, reviews: reviews.length };
    }

    function resetImportFileInput(fileInput, section) {
        if (fileInput) fileInput.value = '';
        var label = section && section.querySelector('#sr-import-file-name');
        if (label) label.textContent = t('importFileLabel');
        var btn = section && section.querySelector('#sr-import-btn');
        if (btn) btn.disabled = true;
    }

    function exportRatings() {
        apiFetch('GET', 'export').then(function (payload) {
            var section = document.getElementById('starrating-home-page');
            var format = selectedToolFormat(section, '#sr-export-format');
            var stamp = new Date().toISOString().replace(/[:.]/g, '-');

            return enrichExportPayload(payload).then(function (result) {
                if (format === 'csv') {
                    downloadText('starrating-' + stamp + '.csv', exportPayloadToCsv(result.rows), 'text/csv;charset=utf-8');
                } else {
                    downloadText('starrating-' + stamp + '.json', JSON.stringify(exportPayloadToJson(result.rows, result.payload), null, 2), 'application/json');
                }
            });
        }).catch(function (err) { toast(explainError(err)); });
    }

    function importRatings(fileInput, section) {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;

        var reader = new FileReader();
        reader.onload = function (event) {
            var mode = section.querySelector('input[name="sr-import-mode"]:checked');
            var overwrite = mode && mode.value === 'overwrite';
            var format = selectedToolFormat(section, '#sr-import-format');
            var content = String(event.target.result || '');
            var body;

            try {
                if (format === 'csv') {
                    body = csvToImportPayload(content, overwrite);
                } else {
                    body = jsonToImportPayload(JSON.parse(content), overwrite);
                }
            } catch (_) {
                toast(t('errorGeneric'));
                return;
            }

            apiFetch('POST', 'import', body).then(function () {
                toast(t('importSuccess', importPayloadCounts(body)));
                resetImportFileInput(fileInput, section);
                loadHomeItems(true);
            }).catch(function (err) { toast(explainError(err)); });
        };
        reader.readAsText(file);
    }

    // ── Modération admin ─────────────────────────────────────────────────────

    var adminReviewsCache = [];

    function loadAdminReviews() {
        if (!pluginConfig.isAdmin) return;
        var container = document.getElementById('sr-admin-container');
        if (!container) return;
        container.innerHTML = '<div class="sr-home-loading">' + t('loading') + '</div>';

        apiFetch('GET', 'admin/reviews').then(function (reviews) {
            adminReviewsCache = reviews || [];
            renderAdminReviews(adminReviewsCache);
        }).catch(function () {
            container.innerHTML = '<div class="sr-home-empty">' + t('adminEmpty') + '</div>';
        });
    }

    function renderAdminReviews(reviews) {
        var container = document.getElementById('sr-admin-container');
        if (!container) return;

        if (!reviews.length) {
            container.innerHTML = '<div class="sr-home-empty">' + t('adminEmpty') + '</div>';
            return;
        }

        container.innerHTML = reviews.map(function (raw) {
            var review = {
                id:         raw.id ?? raw.Id,
                userId:     raw.userId ?? raw.UserId,
                userName:   raw.userName ?? raw.UserName ?? '—',
                itemId:     raw.itemId ?? raw.ItemId,
                reviewText: raw.reviewText ?? raw.ReviewText ?? '',
                userRating: raw.userRating ?? raw.UserRating ?? 0,
                createdAt:  raw.createdAt ?? raw.CreatedAt
            };

            var date = '';
            try { if (review.createdAt) date = new Date(review.createdAt).toLocaleString(); } catch (_) {}

            return '<div class="sr-admin-card" data-review-id="' + review.id + '" data-item-id="' + escHtml(review.itemId) + '">' +
                       '<div class="sr-admin-header">' +
                           '<span class="sr-review-author">' + escHtml(review.userName) + '</span>' +
                           (review.userRating > 0 ? '<span class="sr-review-stars">' + starsHtml(review.userRating) + '</span>' : '') +
                           '<span class="sr-review-date">' + date + '</span>' +
                       '</div>' +
                       '<div class="sr-review-text">' + escHtml(review.reviewText) + '</div>' +
                       '<div class="sr-review-own-actions">' +
                           '<a class="sr-edit-btn" href="#!/details?id=' + encodeURIComponent(review.itemId) + '">→</a>' +
                           '<button type="button" class="sr-delete-btn" data-action="delete">' + t('adminDelete') + '</button>' +
                           '<button type="button" class="sr-delete-btn" data-action="purge">' + t('adminPurge') + '</button>' +
                       '</div>' +
                   '</div>';
        }).join('');

        container.querySelectorAll('.sr-admin-card').forEach(function (card) {
            var reviewId = card.dataset.reviewId;
            var itemId   = card.dataset.itemId;

            card.querySelector('[data-action="delete"]').addEventListener('click', function () {
                confirmDialog(t('confirmDeleteReviewAdmin')).then(function (ok) {
                    if (!ok) return;
                    apiFetch('DELETE', 'admin/review/' + reviewId).then(loadAdminReviews)
                        .catch(function (err) { toast(explainError(err)); });
                });
            });

            card.querySelector('[data-action="purge"]').addEventListener('click', function () {
                confirmDialog(t('confirmPurge')).then(function (ok) {
                    if (!ok) return;
                    apiFetch('DELETE', 'admin/item/' + itemId).then(loadAdminReviews)
                        .catch(function (err) { toast(explainError(err)); });
                });
            });
        });
    }

    // ── Badges sur les affiches ──────────────────────────────────────────────

    // Map { itemIdNormalisé : { rating, average } }
    var myRatingsMap = {};
    var summariesMap = {};
    var ratingsLoaded = false;
    var ratingsLoadingPromise = null;

    function posterCacheKey(name) {
        return 'StarRating:' + currentUserId() + ':' + name;
    }

    function readPosterCache() {
        try {
            var ratings = localStorage.getItem(posterCacheKey('myRatingsMap'));
            var summaries = localStorage.getItem(posterCacheKey('summariesMap'));
            if (ratings) myRatingsMap = JSON.parse(ratings) || {};
            if (summaries) summariesMap = JSON.parse(summaries) || {};
        } catch (_) {}
    }

    function writePosterCache() {
        try {
            localStorage.setItem(posterCacheKey('myRatingsMap'), JSON.stringify(myRatingsMap));
            localStorage.setItem(posterCacheKey('summariesMap'), JSON.stringify(summariesMap));
        } catch (_) {}
    }

    function setCachedPosterRating(itemId, rating) {
        var key = normalizeItemId(itemId);
        if (!key) return;

        if (rating && rating > 0) {
            myRatingsMap[key] = rating;
            summariesMap[key] = rating;
        } else {
            delete myRatingsMap[key];
            delete summariesMap[key];
        }

        writePosterCache();
        refreshPosterBadgesApply();
    }

    function loadMyRatings(force) {
        if (!force && ratingsLoadingPromise) return ratingsLoadingPromise;
        if (!force && ratingsLoaded) return Promise.resolve();

        ratingsLoadingPromise = apiFetch('GET', 'my-ratings').then(function (list) {
            myRatingsMap = {};
            (list || []).forEach(function (r) {
                var id = r.itemId ?? r.ItemId;
                var rating = r.rating ?? r.Rating ?? 0;
                if (id) myRatingsMap[normalizeItemId(id)] = rating;
            });
            ratingsLoaded = true;
            ratingsLoadingPromise = null;
            writePosterCache();
            refreshPosterBadgesApply();
        }).catch(function () {
            ratingsLoaded = true;
            ratingsLoadingPromise = null;
        });

        return ratingsLoadingPromise;
    }

    function extractItemIdFromHref(href) {
        var m = href.match(/[?&#]id=([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
        if (m) return m[1];
        m = href.match(/[?&#]id=([a-f0-9]{32})/i);
        return m ? m[1] : null;
    }

    function cleanupNavigationArtifacts() {
        document.querySelectorAll('.sr-confirm-overlay').forEach(function (el) {
            el.remove();
        });

        document.querySelectorAll('[data-sr-position-patched]').forEach(function (el) {
            el.style.position = '';
            delete el.dataset.srPositionPatched;
        });

        document.querySelectorAll('.card, .cardBox, .cardWrapper').forEach(function (card) {
            card.classList.remove('show-focus', 'emby-focus', 'activeCard', 'card-focus');
            if (card === document.activeElement && typeof card.blur === 'function') {
                card.blur();
            }
        });

        if (document.activeElement && document.activeElement !== document.body && typeof document.activeElement.blur === 'function') {
            try { document.activeElement.blur(); } catch (_) {}
        }
    }

    function applyBadge(container, value) {
        if (!container) return;

        var existing = container.querySelector(':scope > .sr-poster-badge');
        var expected = value && value > 0 ? value + '/5' : '';

        if (existing) {
            var current = (existing.textContent || '').replace(/^[★\s]*/, '');
            if (current === expected) return;
            existing.remove();
        }

        if (!value || value <= 0) return;

        var badge = document.createElement('div');
        badge.className = 'sr-poster-badge';
        badge.innerHTML = '<span class="sr-star">★</span>' + value + '/5';

        if (getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
            if (!container.closest('#starrating-home-page')) {
                container.dataset.srPositionPatched = '1';
            }
        }

        container.insertBefore(badge, container.firstChild);
    }

    function findPosterCard(link) {
        return link.closest('.card, .cardBox, .cardWrapper') || link;
    }

    function findPosterBadgeTarget(link) {
        if (link.closest('#starrating-home-page')) {
            return link.querySelector('.sr-rated-poster') || link;
        }

        var card = findPosterCard(link);
        var selectors = [
            '.cardImageContainer',
            '.cardContent.cardImageContainer',
            '.cardContent',
            '.cardScalable',
            '.coveredImage',
            '.cardImage'
        ];

        for (var i = 0; i < selectors.length; i++) {
            var target = card.querySelector(selectors[i]);
            if (target) return target;
        }

        return card;
    }

    function isEpisodeOrSeasonCard(link) {
        var card = findPosterCard(link);
        if (!card) return false;

        if (card.matches && (card.matches('[data-type="Episode"], [data-type="Season"]'))) {
            return true;
        }
        if (card.querySelector('[data-type="Episode"], [data-type="Season"]')) {
            return true;
        }
        if (card.querySelector('.card-Episode, .card-Season')) {
            return true;
        }

        var subtitle = card.querySelector('.cardText-secondary, .secondary, .cardSubText, .cardText');
        var combined = '';
        card.querySelectorAll('.cardText, .cardText-secondary, .secondary, .cardSubText').forEach(function (el) {
            combined += ' ' + (el.textContent || '');
        });
        if (!combined && subtitle) combined = subtitle.textContent || '';

        return /\bS\d+\s*[:E]\s*E?\d+\b/i.test(combined) || /Saison\s*\d+/i.test(combined);
    }

    function valueForItem(itemId) {
        var key = normalizeItemId(itemId);
        if (pluginConfig.showAverageOnPosters) {
            var avg = summariesMap[key];
            if (avg && avg > 0) return Math.round(avg * 10) / 10;
        }
        return myRatingsMap[key] || 0;
    }

    function refreshPosterBadges() {
        var links = document.querySelectorAll('a[href*="id="]');
        var unknownIds = [];

        links.forEach(function (link) {
            var href = link.getAttribute('href') || '';
            var itemId = extractItemIdFromHref(href);
            if (!itemId) return;

            var container = findPosterBadgeTarget(link);

            if (isEpisodeOrSeasonCard(link)) {
                applyBadge(container, 0);
                return;
            }

            applyBadge(container, valueForItem(itemId));

            if (pluginConfig.showAverageOnPosters && !(normalizeItemId(itemId) in summariesMap)) {
                unknownIds.push(itemId);
            }
        });

        if (pluginConfig.showAverageOnPosters && unknownIds.length) {
            unknownIds.forEach(function (id) { summariesMap[normalizeItemId(id)] = 0; });
            apiFetch('POST', 'summaries', { itemIds: unknownIds }).then(function (responses) {
                (responses || []).forEach(function (s) {
                    var id = s.itemId ?? s.ItemId;
                    if (!id) return;
                    summariesMap[normalizeItemId(id)] = s.averageRating ?? s.AverageRating ?? 0;
                });
                writePosterCache();
                refreshPosterBadgesApply();
            }).catch(function () {});
        }
    }

    function refreshPosterBadgesApply() {
        var links = document.querySelectorAll('a[href*="id="]');

        links.forEach(function (link) {
            var href = link.getAttribute('href') || '';
            var itemId = extractItemIdFromHref(href);
            if (!itemId) return;

            var container = findPosterBadgeTarget(link);
            if (isEpisodeOrSeasonCard(link)) {
                applyBadge(container, 0);
                return;
            }
            applyBadge(container, valueForItem(itemId));
        });
    }

    var debouncedRefreshPosterBadges = debounce(refreshPosterBadges, 40);

    function removeAllPosterBadges() {
        document.querySelectorAll('.sr-poster-badge').forEach(function (el) {
            if (!el.closest('#starrating-home-page')) el.remove();
        });
        document.querySelectorAll('[data-sr-position-patched]').forEach(function (el) {
            if (el.closest('#starrating-home-page')) return;
            el.style.position = '';
            delete el.dataset.srPositionPatched;
        });
    }

    // ── Surveillance navigation ──────────────────────────────────────────────

    var lastUrl = '';
    var pollerId = null;
    var burstId = null;

    function checkAndInject() {
        if (window.location.href !== lastUrl) {
            lastUrl = window.location.href;
        }

        if (isOnDetailPage()) {
            var existing = document.getElementById('starrating-section');
            var needsInject = !existing || existing.closest('#itemDetailPage.hide') !== null;
            if (needsInject) tryInjectDetailSection();
        } else {
            var sec = document.getElementById('starrating-section');
            if (sec) sec.remove();
            removeDetailMiscRating();
            cleanupNavigationArtifacts();
        }

        refreshPosterBadgesApply();
        debouncedRefreshPosterBadges();
        injectStarRatingHomeTab();
    }

    function startBurst() {
        if (burstId) clearInterval(burstId);
        var tries = 0;
        burstId = setInterval(function () {
            checkAndInject();
            if (++tries >= 30) {
                clearInterval(burstId);
                burstId = null;
            }
        }, 100);
    }

    function startWatcher() {
        if (pollerId) return;

        pollerId = setInterval(checkAndInject, 1500);

        document.addEventListener('click', function (event) {
            var btn = event.target && event.target.closest ? event.target.closest('#sr-delete-rating') : null;
            if (!btn) return;

            var section = btn.closest('#starrating-section');
            var itemId = section && section.dataset.itemId;
            if (!section || !itemId) return;

            event.preventDefault();
            event.stopImmediatePropagation();
            deleteRatingFromSection(section, itemId, null);
        }, true);

        function onNavigationChange() {
            lastUrl = '';
            if (starRatingHomeActive) hideStarRatingHome();
            cleanupNavigationArtifacts();
            refreshPosterBadgesApply();
            loadMyRatings(true);
            checkAndInject();
            startBurst();
        }

        window.addEventListener('hashchange', onNavigationChange);
        window.addEventListener('popstate', onNavigationChange);

        document.addEventListener('click', handleNavigationClick, true);

        var root = document.getElementById('reactRoot') || document.body;
        new MutationObserver(function (mutations) {
            var newPosterDetected = false;

            for (var i = 0; i < mutations.length; i++) {
                var m = mutations[i];
                if (m.type !== 'childList' || !m.addedNodes || !m.addedNodes.length) continue;

                for (var j = 0; j < m.addedNodes.length; j++) {
                    var node = m.addedNodes[j];
                    if (!node.querySelector) continue;
                    if (node.matches && node.matches('a[href*="id="]')) { newPosterDetected = true; break; }
                    if (node.querySelector('a[href*="id="]')) { newPosterDetected = true; break; }
                }

                if (newPosterDetected) break;
            }

            if (newPosterDetected) {
                refreshPosterBadgesApply();
                debouncedRefreshPosterBadges();
            }

            if (!isOnDetailPage()) return;

            var needs = false;
            for (var k = 0; k < mutations.length; k++) {
                var mm = mutations[k];
                if (mm.type === 'attributes' && mm.target.id === 'itemDetailPage') { needs = true; break; }
                if (mm.type === 'childList') { needs = true; break; }
            }
            if (!needs) return;

            var existing = document.getElementById('starrating-section');
            var misplaced = existing && existing.closest('#itemDetailPage.hide') !== null;
            if (!existing || misplaced) {
                setTimeout(function () {
                    if (isOnDetailPage()) {
                        var ex = document.getElementById('starrating-section');
                        var mp = ex && ex.closest('#itemDetailPage.hide') !== null;
                        if (!ex || mp) tryInjectDetailSection();
                    }
                }, 0);
            }
        }).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

        checkAndInject();
        refreshPosterBadgesApply();
        startBurst();
    }

    // ── Bootstrap ────────────────────────────────────────────────────────────

    function injectStylesIfNeeded() {
        if (document.getElementById('sr-styles')) return;
        var link = document.createElement('link');
        link.id = 'sr-styles';
        link.rel = 'stylesheet';
        link.href = '/StarRating/web/starrating.css?v=' + ASSET_VERSION;
        document.head.appendChild(link);
    }

    function waitForApiClient() {
        if (window.ApiClient && typeof window.ApiClient.getCurrentUserId === 'function') {
            loadPluginConfig().then(function () {
                injectStylesIfNeeded();
                readPosterCache();
                refreshPosterBadgesApply();
                loadMyRatings();
                startWatcher();
            });
        } else {
            setTimeout(waitForApiClient, 300);
        }
    }

    waitForApiClient();
})();
