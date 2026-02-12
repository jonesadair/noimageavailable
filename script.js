// Global state
let allObjects = [];
let filteredObjects = [];
let displayedCount = 0;
const OBJECTS_PER_PAGE = 50;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    loadData();
    setupMobileOptimizations();
});

function setupMobileOptimizations() {
    // Prevent body scroll when modal is open (mobile Safari fix)
    const modal = document.getElementById('objectModal');
    modal.addEventListener('show', function() {
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.width = '100%';
    });
    
    // Re-enable body scroll when modal closes
    const closeModal = function() {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
        modal.style.display = 'none';
    };
    
    // Update existing close handlers
    document.querySelector('.close').addEventListener('click', closeModal);
    window.addEventListener('click', function(event) {
        if (event.target === modal) {
            closeModal();
        }
    });
    
    // Improve scroll performance on mobile
    if ('ontouchstart' in window) {
        document.getElementById('objectGrid').style.webkitOverflowScrolling = 'touch';
    }
    
    // Add visual feedback for touch on cards
    document.addEventListener('touchstart', function(e) {
        if (e.target.closest('.object-card')) {
            e.target.closest('.object-card').style.opacity = '0.7';
        }
    }, { passive: true });
    
    document.addEventListener('touchend', function(e) {
        if (e.target.closest('.object-card')) {
            setTimeout(() => {
                e.target.closest('.object-card').style.opacity = '1';
            }, 100);
        }
    }, { passive: true });
}

function initializeEventListeners() {
    // Search input
    document.getElementById('searchInput').addEventListener('input', debounce(applyFilters, 300));
    
    // Filter dropdowns
    document.getElementById('departmentFilter').addEventListener('change', applyFilters);
    document.getElementById('dateRange').addEventListener('change', applyFilters);
    document.getElementById('galleryStatus').addEventListener('change', applyFilters);
    document.getElementById('referenceStatus').addEventListener('change', applyFilters);
    document.getElementById('descriptionStatus').addEventListener('change', applyFilters);
    document.getElementById('sortBy').addEventListener('change', applyFilters);
    
    // Reset button
    document.getElementById('resetFilters').addEventListener('click', resetFilters);
    
    // Load more button
    document.getElementById('loadMoreBtn').addEventListener('click', loadMoreObjects);
    
    // Modal close
    document.querySelector('.close').addEventListener('click', closeModal);
    window.addEventListener('click', function(event) {
        const modal = document.getElementById('objectModal');
        if (event.target === modal) {
            closeModal();
        }
    });
    
    // File input for manual data loading
    document.getElementById('fileInput').addEventListener('change', handleFileUpload);
}

// Load data from JSON file
async function loadData() {
    try {
        // Try to load from IndexedDB cache first
        console.log('Checking cache...');
        const cachedData = await window.MetCache.loadFromCache();
        
        if (cachedData) {
            // Use cached data - instant load!
            console.log('Using cached data - instant load! ');
            const objectsArray = Array.isArray(cachedData) ? cachedData : cachedData.objects;
            processData(objectsArray);
            return;
        }
        
        // No cache - fetch from network
        console.log('No cache found, fetching from network...');
        const response = await fetch('all_unpictured_ancient_objects.json');
        
        if (response.ok) {
            const data = await response.json();
            const objectsArray = Array.isArray(data) ? data : data.objects;
            
            // Save to cache for next time
            console.log('Saving to cache for future visits...');
            await window.MetCache.saveToCache(objectsArray);
            
            processData(objectsArray);
        } else {
            // Show file upload interface
            document.getElementById('noData').style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('noData').style.display = 'block';
    }
}

// Handle manual file upload
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);
                // Handle both formats: array or object with 'objects' property
                const objectsArray = Array.isArray(data) ? data : data.objects;
                processData(objectsArray);
                document.getElementById('noData').style.display = 'none';
            } catch (error) {
                alert('Error parsing JSON file: ' + error.message);
            }
        };
        reader.readAsText(file);
    }
}

// Process loaded data
function processData(data) {
    // Handle both formats: plain array or object with 'objects' property
    allObjects = Array.isArray(data) ? data : (data.objects || []);
    console.log(`Loaded ${allObjects.length} objects`);
    
    // Hide the "No Data" message aggressively
    const noDataElement = document.getElementById('noData');
    if (noDataElement) {
        noDataElement.style.display = 'none';
        noDataElement.style.visibility = 'hidden';
        noDataElement.style.opacity = '0';
    }
    
    // Check for missing fields (for debugging)
    checkDataCompleteness(allObjects);
    
    // Load documentation progress from localStorage
    loadDocumentationProgress();
    
    // Populate filter dropdowns
    populateFilters();
    
    // Initial display
    applyFilters();
    
    // Update progress bar
    updateProgressBar();
}

// Check what fields are missing or empty (debugging helper)
function checkDataCompleteness(objects) {
    if (objects.length === 0) return;
    
    const fieldStats = {};
    const allFields = Object.keys(objects[0]);
    
    // Initialize stats
    allFields.forEach(field => {
        fieldStats[field] = { empty: 0, present: 0 };
    });
    
    // Count empty vs present
    objects.forEach(obj => {
        allFields.forEach(field => {
            const value = obj[field];
            if (value === null || value === undefined || value === '' || 
                (Array.isArray(value) && value.length === 0)) {
                fieldStats[field].empty++;
            } else {
                fieldStats[field].present++;
            }
        });
    });
    
    console.log('Field Completeness Report:');
    console.log('=========================');
    Object.entries(fieldStats).forEach(([field, stats]) => {
        const percentPresent = ((stats.present / objects.length) * 100).toFixed(1);
        console.log(`${field}: ${percentPresent}% present (${stats.present}/${objects.length})`);
    });
    
    // Warn about completely missing fields that should be present
    const expectedFields = [
        'objectID', 'accessionNumber', 'title', 'department', 'objectDate',
        'culture', 'period', 'medium', 'dimensions', 'objectURL',
        // CRITICAL: Reference fields for finding published images
        'creditLine', 'linkResource', 'objectWikidataURL',
        'GalleryNumber', 'exhibitionHistory', 'references'
    ];
    
    expectedFields.forEach(field => {
        if (!fieldStats[field]) {
            console.warn(` MISSING FIELD: ${field} - This field is not being captured by the scraper!`);
        }
    });
}

// Helper: Check if object is on view
function isOnView(obj) {
    const gallery = obj.GalleryNumber || '';
    return gallery !== '' && gallery !== null && gallery !== undefined;
}

// Helper: Check if object has references
function hasReferences(obj) {
    const hasRefs = obj.references && obj.references !== '';
    const hasExhibitions = obj.exhibitionHistory && obj.exhibitionHistory !== '';
    return hasRefs || hasExhibitions;
}

// Helper: Check if object is photographable (on view but no references)
function isPhotographable(obj) {
    return isOnView(obj) && !hasReferences(obj);
}

// Helper: Check if object has description
function hasDescription(obj) {
    return !!(obj.description || obj.objectDescription || obj.label || obj.labelText);
}

// Populate filter dropdowns with unique values
function populateFilters() {
    const departments = new Set();
    
    allObjects.forEach(obj => {
        if (obj.department) departments.add(obj.department);
    });
    
    populateDropdown('departmentFilter', Array.from(departments).sort());
}

function populateDropdown(elementId, values) {
    const select = document.getElementById(elementId);
    const defaultOption = select.querySelector('option[value=""]');
    
    // Remove existing options except the default
    select.innerHTML = '';
    select.appendChild(defaultOption);
    
    // Add new options
    values.forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
    });
}

// Apply all filters and search
function applyFilters() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const department = document.getElementById('departmentFilter').value;
    const dateRange = document.getElementById('dateRange').value;
    const galleryStatus = document.getElementById('galleryStatus').value;
    const referenceStatus = document.getElementById('referenceStatus').value;
    const descriptionStatus = document.getElementById('descriptionStatus').value;
    const sortBy = document.getElementById('sortBy').value;
    
    // Filter objects
    filteredObjects = allObjects.filter(obj => {
        // Search term
        if (searchTerm) {
            const searchableText = [
                obj.title,
                obj.objectName,
                obj.description,
                obj.objectDescription,
                obj.label,
                obj.labelText,
                obj.culture,
                obj.period,
                obj.accessionNumber,
                obj.dynasty,
                obj.medium,
                obj.country,
                obj.region,
                obj.classification
            ].filter(Boolean).join(' ').toLowerCase();
            
            if (!searchableText.includes(searchTerm)) return false;
        }
        
        // Department filter
        if (department && obj.department !== department) return false;
        
        // Date range filter
        if (dateRange) {
            const endDate = parseInt(obj.objectEndDate);
            if (!isNaN(endDate)) {
                switch(dateRange) {
                    case 'prehistoric':
                        if (endDate >= -3000) return false;
                        break;
                    case 'bronze':
                        if (endDate < -3000 || endDate > -1200) return false;
                        break;
                    case 'iron':
                        if (endDate < -1200 || endDate > -500) return false;
                        break;
                    case 'classical':
                        if (endDate < -500 || endDate > 0) return false;
                        break;
                    case 'early':
                        if (endDate < 0 || endDate > 500) return false;
                        break;
                }
            }
        }
        
        // Gallery status filter
        if (galleryStatus) {
            if (galleryStatus === 'on-view' && !isOnView(obj)) return false;
            if (galleryStatus === 'in-storage' && isOnView(obj)) return false;
        }
        
        // Reference status filter
        if (referenceStatus) {
            if (referenceStatus === 'has-references' && !hasReferences(obj)) return false;
            if (referenceStatus === 'no-references' && hasReferences(obj)) return false;
            if (referenceStatus === 'photographable' && !isPhotographable(obj)) return false;
        }
        
        // Description status filter
        if (descriptionStatus) {
            if (descriptionStatus === 'has-description' && !hasDescription(obj)) return false;
            if (descriptionStatus === 'no-description' && hasDescription(obj)) return false;
        }
        
        return true;
    });
    
    // Sort objects
    sortObjects(sortBy);
    
    // Update display
    displayedCount = 0;
    document.getElementById('objectGrid').innerHTML = '';
    loadMoreObjects();
    
    // Update result count
    updateResultCount();
    
    // Update status breakdown
    updateStatusBreakdown();
}

function sortObjects(sortBy) {
    switch(sortBy) {
        case 'accession':
            filteredObjects.sort((a, b) => 
                (a.accessionNumber || '').localeCompare(b.accessionNumber || '')
            );
            break;
        case 'date':
            filteredObjects.sort((a, b) => 
                (parseInt(a.objectEndDate) || 0) - (parseInt(b.objectEndDate) || 0)
            );
            break;
        case 'date-recent':
            filteredObjects.sort((a, b) => 
                (parseInt(b.objectEndDate) || 0) - (parseInt(a.objectEndDate) || 0)
            );
            break;
        case 'culture':
            filteredObjects.sort((a, b) => 
                (a.culture || '').localeCompare(b.culture || '')
            );
            break;
        case 'department':
            filteredObjects.sort((a, b) => 
                (a.department || '').localeCompare(b.department || '')
            );
            break;
        case 'gallery':
            // Sort by gallery number, with on-view items first
            filteredObjects.sort((a, b) => {
                const aOnView = isOnView(a);
                const bOnView = isOnView(b);
                
                if (aOnView && !bOnView) return -1;
                if (!aOnView && bOnView) return 1;
                
                return (a.GalleryNumber || '').localeCompare(b.GalleryNumber || '');
            });
            break;
    }
}

function resetFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('departmentFilter').value = '';
    document.getElementById('dateRange').value = '';
    document.getElementById('galleryStatus').value = '';
    document.getElementById('referenceStatus').value = '';
    document.getElementById('descriptionStatus').value = '';
    document.getElementById('sortBy').value = 'accession';
    applyFilters();
}

function loadMoreObjects() {
    const grid = document.getElementById('objectGrid');
    const endIndex = Math.min(displayedCount + OBJECTS_PER_PAGE, filteredObjects.length);
    
    for (let i = displayedCount; i < endIndex; i++) {
        const card = createObjectCard(filteredObjects[i]);
        grid.appendChild(card);
    }
    
    displayedCount = endIndex;
    
    // Show/hide load more button
    const loadMoreDiv = document.getElementById('loadMore');
    if (displayedCount < filteredObjects.length) {
        loadMoreDiv.style.display = 'block';
    } else {
        loadMoreDiv.style.display = 'none';
    }
}

function createObjectCard(obj) {
    const card = document.createElement('div');
    card.className = 'object-card';
    card.addEventListener('click', () => showObjectDetail(obj));
    
    const title = obj.title || 'Untitled Object';
    const accession = obj.accessionNumber || 'No accession number';
    const culture = obj.culture || 'Unknown culture';
    const date = obj.objectDate || 'Date unknown';
    const department = obj.department || 'Unknown department';
    const medium = obj.medium || 'Unknown medium';
    
    // Create status badges
    const badges = [];
    
    if (isOnView(obj)) {
        badges.push(`<span class="card-badge gallery"> Gallery ${escapeHtml(obj.GalleryNumber)}</span>`);
    } else {
        badges.push(`<span class="card-badge storage"> In Storage</span>`);
    }
    
    if (hasReferences(obj)) {
        badges.push(`<span class="card-badge has-refs"> Has References</span>`);
    }
    
    if (isPhotographable(obj)) {
        badges.push(`<span class="card-badge photographable"> Photographable!</span>`);
    }
    
    card.innerHTML = `
        <div class="object-card-header">
            <h3>${escapeHtml(title)}</h3>
            <div class="accession-number">${escapeHtml(accession)}</div>
        </div>
        <div class="object-card-body">
            <div class="card-badges">
                ${badges.join('')}
            </div>
            <div class="metadata-row">
                <span class="metadata-label">Culture:</span>
                <span class="metadata-value ${culture === 'Unknown culture' ? 'empty' : ''}">${escapeHtml(culture)}</span>
            </div>
            <div class="metadata-row">
                <span class="metadata-label">Date:</span>
                <span class="metadata-value ${date === 'Date unknown' ? 'empty' : ''}">${escapeHtml(date)}</span>
            </div>
            <div class="metadata-row">
                <span class="metadata-label">Department:</span>
                <span class="metadata-value">${escapeHtml(department)}</span>
            </div>
            <div class="metadata-row">
                <span class="metadata-label">Medium:</span>
                <span class="metadata-value ${medium === 'Unknown medium' ? 'empty' : ''}">${escapeHtml(medium)}</span>
            </div>
            ${createTagSection(obj)}
        </div>
    `;
    
    return card;
}

function createTagSection(obj) {
    const tags = [];
    
    if (obj.period) tags.push(obj.period);
    if (obj.dynasty) tags.push(obj.dynasty);
    if (obj.classification) tags.push(obj.classification);
    
    if (tags.length === 0) return '';
    
    const tagHtml = tags.slice(0, 3).map(tag => 
        `<span class="tag">${escapeHtml(tag)}</span>`
    ).join('');
    
    return `
        <div class="object-tags">
            ${tagHtml}
            ${tags.length > 3 ? `<span class="tag">+${tags.length - 3} more</span>` : ''}
        </div>
    `;
}

function showObjectDetail(obj) {
    const modal = document.getElementById('objectModal');
    const modalBody = document.getElementById('modalBody');
    
    modalBody.innerHTML = createDetailView(obj);
    modal.style.display = 'block';
    
    // Prevent body scroll on mobile
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
}

function createDetailView(obj) {
    const title = obj.title || 'Untitled Object';
    const accession = obj.accessionNumber || 'No accession number';
    const isDoc = isDocumented(obj.objectID);
    
    return `
        <div class="modal-header">
            <span class="close">&times;</span>
            <h2>${escapeHtml(title)}</h2>
            <div class="accession-number" style="font-size: 1rem; opacity: 0.9; margin-top: 0.5rem;">
                ${escapeHtml(accession)}
            </div>
            <div style="margin-top: 1rem;">
                <button 
                    onclick="toggleDocumented(${obj.objectID})" 
                    class="btn-documentation ${isDoc ? 'documented' : ''}"
                    id="docButton_${obj.objectID}">
                    ${isDoc ? 'DOCUMENTED' : 'MARK AS DOCUMENTED'}
                </button>
            </div>
        </div>
        
        <div class="modal-body">
            ${createDescriptionSection(obj)}
            ${createCoreIdentificationSection(obj)}
            ${createPhysicalDescriptionSection(obj)}
            ${createProvenienceSection(obj)}
            ${createChronologySection(obj)}
            ${createArtistMakerSection(obj)}
            ${createReferencesSection(obj)}
            ${createAdditionalInfoSection(obj)}
            ${createLinksSection(obj)}
        </div>
    `;
}

function createUserContributionsSection(obj) {
    const userContribution = getUserContribution(obj.objectID);
    const hasContribution = userContribution && (userContribution.images?.length > 0 || userContribution.notes);
    
    return `
        <div class="detail-section user-contribution-section">
            <h3> USER CONTRIBUTIONS - ADAIR JONES</h3>
            
            ${hasContribution ? `
                <div class="user-contribution-display">
                    ${userContribution.images && userContribution.images.length > 0 ? `
                        <div class="user-images">
                            <h4>User-Added Images:</h4>
                            <div class="user-image-gallery">
                                ${userContribution.images.map((img, idx) => `
                                    <div class="user-image-item">
                                        <img src="${img.url || img.dataUrl}" alt="User image ${idx + 1}">
                                        <button class="btn-remove-image" onclick="removeUserImage(${obj.objectID}, ${idx})"> Remove</button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    
                    ${userContribution.notes ? `
                        <div class="user-notes">
                            <h4>Additional Notes:</h4>
                            <div class="user-notes-text">${escapeHtml(userContribution.notes)}</div>
                        </div>
                    ` : ''}
                    
                    <div class="user-attribution">
                        Updated by Adair Jones on ${formatTimestamp(userContribution.timestamp)}
                    </div>
                    
                    <button class="btn-edit-contribution" onclick="showEditContribution(${obj.objectID})">
                         Edit Contribution
                    </button>
                </div>
            ` : `
                <div class="user-contribution-empty">
                    <p>No user contributions yet. Add your own images and notes!</p>
                    <button class="btn-add-contribution" onclick="showEditContribution(${obj.objectID})">
                         Add Images & Notes
                    </button>
                </div>
            `}
            
            <div id="contributionEditor_${obj.objectID}" class="contribution-editor" style="display: none;">
                <h4>Add Your Contribution:</h4>
                
                <div class="editor-section">
                    <label>Upload Images:</label>
                    <input type="file" id="imageUpload_${obj.objectID}" accept="image/*" multiple>
                    <div id="imagePreview_${obj.objectID}" class="image-preview"></div>
                </div>
                
                <div class="editor-section">
                    <label>Additional Notes:</label>
                    <textarea id="notesInput_${obj.objectID}" rows="6" placeholder="Add your observations, sources, or other notes about this object...">${userContribution?.notes || ''}</textarea>
                </div>
                
                <div class="editor-actions">
                    <button class="btn-save-contribution" onclick="saveContribution(${obj.objectID})"> Save Contribution</button>
                    <button class="btn-cancel" onclick="hideEditContribution(${obj.objectID})">Cancel</button>
                </div>
            </div>
        </div>
    `;
}

function createDescriptionSection(obj) {
    const hasDescription = obj.description || obj.objectDescription || obj.label || obj.labelText;
    
    if (!hasDescription) return '';
    
    return `
        <div class="detail-section">
            <h3> Description</h3>
            <div class="description-text">
                ${obj.description ? `<p>${escapeHtml(obj.description)}</p>` : ''}
                ${obj.objectDescription ? `<p>${escapeHtml(obj.objectDescription)}</p>` : ''}
                ${obj.label ? `<p>${escapeHtml(obj.label)}</p>` : ''}
                ${obj.labelText ? `<p>${escapeHtml(obj.labelText)}</p>` : ''}
            </div>
        </div>
    `;
}

function createCoreIdentificationSection(obj) {
    return `
        <div class="detail-section">
            <h3> Core Identification</h3>
            <div class="detail-grid">
                ${createDetailItem('Object ID', obj.objectID)}
                ${createDetailItem('Accession Number', obj.accessionNumber)}
                ${createDetailItem('Object Name', obj.objectName)}
                ${createDetailItem('Title', obj.title)}
                ${createDetailItem('Department', obj.department)}
                ${createDetailItem('Classification', obj.classification)}
                ${createDetailItem('Is Highlight', obj.isHighlight ? 'Yes' : 'No')}
                ${createDetailItem('Is Timeline Work', obj.isTimelineWork ? 'Yes' : 'No')}
            </div>
        </div>
    `;
}

function createPhysicalDescriptionSection(obj) {
    return `
        <div class="detail-section">
            <h3> Physical Description</h3>
            <div class="detail-grid">
                ${createDetailItem('Medium', obj.medium)}
                ${createDetailItem('Dimensions', obj.dimensions)}
                ${obj.measurements && obj.measurements.length > 0 ? createMeasurementsItem(obj.measurements) : ''}
            </div>
        </div>
    `;
}

function createProvenienceSection(obj) {
    const hasGeoData = obj.city || obj.country || obj.region || obj.subregion || 
                        obj.locale || obj.locus || obj.excavation || obj.river;
    
    if (!hasGeoData) return '';
    
    return `
        <div class="detail-section">
            <h3> Geographical Origin & Provenance</h3>
            <div class="detail-grid">
                ${createDetailItem('Geography Type', obj.geographyType)}
                ${createDetailItem('Country', obj.country)}
                ${createDetailItem('Region', obj.region)}
                ${createDetailItem('Subregion', obj.subregion)}
                ${createDetailItem('City', obj.city)}
                ${createDetailItem('State/Province', obj.state)}
                ${createDetailItem('County', obj.county)}
                ${createDetailItem('Locale', obj.locale)}
                ${createDetailItem('Locus', obj.locus)}
                ${createDetailItem('Excavation', obj.excavation)}
                ${createDetailItem('River', obj.river)}
            </div>
        </div>
    `;
}

function createChronologySection(obj) {
    return `
        <div class="detail-section">
            <h3> Chronology & Cultural Context</h3>
            <div class="detail-grid">
                ${createDetailItem('Culture', obj.culture)}
                ${createDetailItem('Period', obj.period)}
                ${createDetailItem('Dynasty', obj.dynasty)}
                ${createDetailItem('Reign', obj.reign)}
                ${createDetailItem('Object Date', obj.objectDate)}
                ${createDetailItem('Begin Date', obj.objectBeginDate ? formatDate(obj.objectBeginDate) : null)}
                ${createDetailItem('End Date', obj.objectEndDate ? formatDate(obj.objectEndDate) : null)}
            </div>
        </div>
    `;
}

function createArtistMakerSection(obj) {
    const hasArtistData = obj.artistDisplayName || obj.artistRole || obj.artistNationality;
    
    if (!hasArtistData) return '';
    
    return `
        <div class="detail-section">
            <h3> Artist / Maker</h3>
            <div class="detail-grid">
                ${createDetailItem('Artist Name', obj.artistDisplayName)}
                ${createDetailItem('Artist Role', obj.artistRole)}
                ${createDetailItem('Artist Bio', obj.artistDisplayBio)}
                ${createDetailItem('Nationality', obj.artistNationality)}
                ${createDetailItem('Artist Dates', 
                    obj.artistBeginDate && obj.artistEndDate 
                        ? `${obj.artistBeginDate} - ${obj.artistEndDate}` 
                        : null
                )}
            </div>
            ${obj.constituents && obj.constituents.length > 0 ? createConstituentsItem(obj.constituents) : ''}
        </div>
    `;
}

function createReferencesSection(obj) {
    // THIS IS CRITICAL - shows what reference fields we're capturing
    const onView = isOnView(obj);
    const hasRefs = hasReferences(obj);
    const photographable = isPhotographable(obj);
    
    return `
        <div class="detail-section">
            <h3> References & Documentation</h3>
            <div class="references-section">
                ${photographable ? `
                    <div style="background: #000000; border-left: 4px solid #23ff12; padding: 1rem; margin-bottom: 1rem; border-radius: 4px;">
                        <strong style="color: #23ff12;"> PHOTOGRAPHABLE OBJECT!</strong>
                        <p style="margin-top: 0.5rem; color: #ccdacc;">
                            Currently on display in Gallery ${escapeHtml(obj.GalleryNumber || '')} with no published references in the database. Available for in-person photography at the museum.
                        </p>
                    </div>
                ` : ''}
                
                ${onView && hasRefs ? `
                    <div style="background: #000000; border-left: 4px solid #23ff12; padding: 1rem; margin-bottom: 1rem; border-radius: 4px;">
                        <strong style="color: #23ff12;"> On View in Gallery ${escapeHtml(obj.GalleryNumber || '')}</strong>
                        <p style="margin-top: 0.5rem; color: #ccdacc;">
                            Currently on display. Available for in-person photography with published references listed below.
                        </p>
                    </div>
                ` : ''}
                
                ${onView && !hasRefs && !photographable ? `
                    <div style="background: #000000; border-left: 4px solid #23ff12; padding: 1rem; margin-bottom: 1rem; border-radius: 4px;">
                        <strong style="color: #23ff12;"> On View in Gallery ${escapeHtml(obj.GalleryNumber || '')}</strong>
                        <p style="margin-top: 0.5rem; color: #ccdacc;">
                            Currently on display. Available for in-person photography.
                        </p>
                    </div>
                ` : ''}
                
                ${!onView && !hasRefs ? `
                    <div class="warning-box">
                        <strong> Challenging Object:</strong> 
                        <p style="margin-top: 0.5rem;">
                            In storage (not on public view) with no published references in the database. Special access requests or unpublished excavation reports may be required.
                        </p>
                    </div>
                ` : ''}
                
                ${!onView && hasRefs ? `
                    <div class="warning-box">
                        <strong> In Storage - Check References Below</strong> 
                        <p style="margin-top: 0.5rem;">
                            This object is not currently on public display, but the references below may lead to published images.
                        </p>
                    </div>
                ` : ''}
                
                <div class="detail-grid" style="margin-top: 1rem;">
                    ${createDetailItem('Gallery Number', obj.GalleryNumber || 'Not on view')}
                    ${createDetailItem('Exhibition History', obj.exhibitionHistory)}
                    ${createDetailItem('Bibliographic References', obj.references)}
                    ${createDetailItem('Portfolio/Series', obj.portfolio)}
                    ${createDetailItem('Credit Line', obj.creditLine)}
                    ${createDetailItem('Repository', obj.repository)}
                    ${createDetailItem('Link Resource', obj.linkResource)}
                    ${createDetailItem('Metadata Last Updated', obj.metadataDate)}
                </div>
            </div>
        </div>
    `;
}

function createAdditionalInfoSection(obj) {
    return `
        <div class="detail-section">
            <h3>ℹ Additional Information</h3>
            <div class="detail-grid">
                ${createDetailItem('Is Public Domain', obj.isPublicDomain ? 'Yes' : 'No')}
                ${obj.tags && obj.tags.length > 0 ? createTagsItem(obj.tags) : ''}
            </div>
        </div>
    `;
}

function createLinksSection(obj) {
    return `
        <div class="detail-section">
            <h3> External Resources</h3>
            <div class="detail-grid">
                ${obj.objectURL ? `
                    <div class="detail-item">
                        <div class="detail-label">Met Museum Page</div>
                        <div class="detail-value">
                            <a href="${escapeHtml(obj.objectURL)}" target="_blank" class="external-link">
                                View on Met Website →
                            </a>
                        </div>
                    </div>
                ` : ''}
                ${obj.objectWikidataURL ? `
                    <div class="detail-item">
                        <div class="detail-label">Wikidata</div>
                        <div class="detail-value">
                            <a href="${escapeHtml(obj.objectWikidataURL)}" target="_blank" class="external-link">
                                View on Wikidata →
                            </a>
                        </div>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

function createDetailItem(label, value) {
    if (value === null || value === undefined || value === '') {
        return `
            <div class="detail-item">
                <div class="detail-label">${label}</div>
                <div class="detail-value empty">Not specified</div>
            </div>
        `;
    }
    
    return `
        <div class="detail-item">
            <div class="detail-label">${label}</div>
            <div class="detail-value">${escapeHtml(String(value))}</div>
        </div>
    `;
}

function createMeasurementsItem(measurements) {
    const measurementHtml = measurements.map(m => {
        const parts = [];
        if (m.elementName) parts.push(`<strong>${m.elementName}</strong>`);
        if (m.elementDescription) parts.push(m.elementDescription);
        if (m.elementMeasurements) {
            const dims = Object.entries(m.elementMeasurements)
                .map(([key, val]) => `${key}: ${val}`)
                .join(', ');
            parts.push(dims);
        }
        return parts.join(' - ');
    }).join('<br>');
    
    return `
        <div class="detail-item" style="grid-column: 1 / -1;">
            <div class="detail-label">Detailed Measurements</div>
            <div class="detail-value">${measurementHtml}</div>
        </div>
    `;
}

function createConstituentsItem(constituents) {
    const constituentHtml = constituents.map(c => {
        const parts = [];
        if (c.name) parts.push(`<strong>${escapeHtml(c.name)}</strong>`);
        if (c.role) parts.push(`(${escapeHtml(c.role)})`);
        return parts.join(' ');
    }).join('<br>');
    
    return `
        <div class="detail-item" style="grid-column: 1 / -1;">
            <div class="detail-label">All Constituents</div>
            <div class="detail-value">${constituentHtml}</div>
        </div>
    `;
}

function createTagsItem(tags) {
    const tagHtml = tags.map(tag => {
        const term = tag.term || tag;
        return `<span class="tag">${escapeHtml(term)}</span>`;
    }).join(' ');
    
    return `
        <div class="detail-item" style="grid-column: 1 / -1;">
            <div class="detail-label">Tags</div>
            <div class="detail-value">${tagHtml}</div>
        </div>
    `;
}

function formatDate(dateNum) {
    const num = parseInt(dateNum);
    if (isNaN(num)) return dateNum;
    
    if (num < 0) {
        return `${Math.abs(num)} BCE`;
    } else {
        return `${num} CE`;
    }
}

function updateResultCount() {
    const count = document.getElementById('resultCount');
    count.textContent = `Showing ${Math.min(displayedCount, filteredObjects.length)} of ${filteredObjects.length} objects`;
    
    if (filteredObjects.length !== allObjects.length) {
        count.textContent += ` (filtered from ${allObjects.length} total)`;
    }
}

function updateStatusBreakdown() {
    const breakdown = document.getElementById('statusBreakdown');
    
    // Calculate stats for filtered objects
    const onViewCount = filteredObjects.filter(obj => isOnView(obj)).length;
    const inStorageCount = filteredObjects.filter(obj => !isOnView(obj)).length;
    const hasRefsCount = filteredObjects.filter(obj => hasReferences(obj)).length;
    const noRefsCount = filteredObjects.filter(obj => !hasReferences(obj)).length;
    const photographableCount = filteredObjects.filter(obj => isPhotographable(obj)).length;
    const hasDescCount = filteredObjects.filter(obj => hasDescription(obj)).length;
    const noDescCount = filteredObjects.filter(obj => !hasDescription(obj)).length;
    
    breakdown.innerHTML = `
        <span class="status-badge on-view"> ${onViewCount} On View</span>
        <span class="status-badge in-storage"> ${inStorageCount} In Storage</span>
        <span class="status-badge has-refs"> ${hasRefsCount} Has References</span>
        <span class="status-badge no-refs"> ${noRefsCount} No References</span>
        <span class="status-badge photographable"> ${photographableCount} Photographable</span>
        <span class="status-badge has-refs"> ${hasDescCount} Has Description</span>
        <span class="status-badge no-refs"> ${noDescCount} No Description</span>
    `;
}

function closeModal() {
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.getElementById('objectModal').style.display = 'none';
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Re-bind close button after modal content updates
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('close')) {
        closeModal();
    }
});

// ============================================================================
// DOCUMENTATION PROGRESS TRACKING
// ============================================================================

// Store which objects have been documented (photographed/added images)
let documentedObjects = new Set();

// Load documentation progress from localStorage
function loadDocumentationProgress() {
    try {
        const stored = localStorage.getItem('met_documented_objects');
        if (stored) {
            const parsed = JSON.parse(stored);
            documentedObjects = new Set(parsed);
            console.log(`Loaded ${documentedObjects.size} documented objects from storage`);
        }
    } catch (error) {
        console.error('Error loading documentation progress:', error);
        documentedObjects = new Set();
    }
}

// Save documentation progress to localStorage
function saveDocumentationProgress() {
    try {
        const array = Array.from(documentedObjects);
        localStorage.setItem('met_documented_objects', JSON.stringify(array));
        console.log(`Saved ${documentedObjects.size} documented objects to storage`);
    } catch (error) {
        console.error('Error saving documentation progress:', error);
    }
}

// Mark an object as documented
function markAsDocumented(objectID) {
    documentedObjects.add(objectID);
    saveDocumentationProgress();
    updateProgressBar();
}

// Unmark an object as documented
function markAsUndocumented(objectID) {
    documentedObjects.delete(objectID);
    saveDocumentationProgress();
    updateProgressBar();
}

// Check if an object is documented
function isDocumented(objectID) {
    return documentedObjects.has(objectID);
}

// Update the progress bar display
function updateProgressBar() {
    if (allObjects.length === 0) {
        document.getElementById('progressStats').textContent = '0 / 0 OBJECTS DOCUMENTED (0%)';
        document.getElementById('progressBarFill').style.width = '0%';
        return;
    }
    
    const totalObjects = allObjects.length;
    const documentedCount = documentedObjects.size;
    const percentage = Math.round((documentedCount / totalObjects) * 100);
    
    document.getElementById('progressStats').textContent = 
        `${documentedCount} / ${totalObjects} OBJECTS DOCUMENTED (${percentage}%)`;
    document.getElementById('progressBarFill').style.width = `${percentage}%`;
}

// Export progress data
function exportProgressData() {
    const data = {
        total_objects: allObjects.length,
        documented_count: documentedObjects.size,
        documented_ids: Array.from(documentedObjects),
        percentage: Math.round((documentedObjects.size / allObjects.length) * 100),
        export_date: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `met_documentation_progress_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// Import progress data
function importProgressData(jsonString) {
    try {
        const data = JSON.parse(jsonString);
        if (data.documented_ids && Array.isArray(data.documented_ids)) {
            documentedObjects = new Set(data.documented_ids);
            saveDocumentationProgress();
            updateProgressBar();
            alert(`Imported ${documentedObjects.size} documented objects`);
        }
    } catch (error) {
        console.error('Error importing progress data:', error);
        alert('Error importing progress data. Please check the file format.');
    }
}

// Reset all progress (with confirmation)
function resetProgress() {
    if (confirm('Are you sure you want to reset all documentation progress? This cannot be undone.')) {
        documentedObjects.clear();
        saveDocumentationProgress();
        updateProgressBar();
        alert('Documentation progress has been reset.');
    }
}

// Toggle documentation status for an object
function toggleDocumented(objectID) {
    if (isDocumented(objectID)) {
        markAsUndocumented(objectID);
    } else {
        markAsDocumented(objectID);
    }
    
    // Update button appearance
    const button = document.getElementById(`docButton_${objectID}`);
    if (button) {
        if (isDocumented(objectID)) {
            button.textContent = ' DOCUMENTED';
            button.classList.add('documented');
        } else {
            button.textContent = ' MARK AS DOCUMENTED';
            button.classList.remove('documented');
        }
    }
}

// ============================================================================
// USER CONTRIBUTIONS (Images & Notes)
// ============================================================================

let userContributions = {};

// Load user contributions from localStorage
function loadUserContributions() {
    try {
        const stored = localStorage.getItem('met_user_contributions');
        if (stored) {
            userContributions = JSON.parse(stored);
            console.log(`Loaded contributions for ${Object.keys(userContributions).length} objects`);
        }
    } catch (error) {
        console.error('Error loading user contributions:', error);
        userContributions = {};
    }
}

// Save user contributions to localStorage
function saveUserContributions() {
    try {
        localStorage.setItem('met_user_contributions', JSON.stringify(userContributions));
        console.log('Saved user contributions to storage');
    } catch (error) {
        console.error('Error saving user contributions:', error);
        alert('Error saving: Storage may be full. Try removing some images.');
    }
}

// Get user contribution for an object
function getUserContribution(objectID) {
    return userContributions[objectID] || null;
}

// Show the contribution editor
function showEditContribution(objectID) {
    const editor = document.getElementById(`contributionEditor_${objectID}`);
    if (editor) {
        editor.style.display = 'block';
        
        // Load existing images into preview
        const contribution = getUserContribution(objectID);
        if (contribution?.images) {
            displayImagePreviews(objectID, contribution.images);
        }
    }
}

// Hide the contribution editor
function hideEditContribution(objectID) {
    const editor = document.getElementById(`contributionEditor_${objectID}`);
    if (editor) {
        editor.style.display = 'none';
    }
}

// Display image previews
function displayImagePreviews(objectID, images) {
    const preview = document.getElementById(`imagePreview_${objectID}`);
    if (!preview) return;
    
    preview.innerHTML = images.map((img, idx) => `
        <div class="preview-image">
            <img src="${img.dataUrl}" alt="Preview ${idx + 1}">
            <button class="btn-remove-preview" onclick="removePreviewImage(${objectID}, ${idx})"></button>
        </div>
    `).join('');
}

// Remove image from preview
function removePreviewImage(objectID, index) {
    const contribution = getUserContribution(objectID) || { images: [], notes: '' };
    contribution.images.splice(index, 1);
    displayImagePreviews(objectID, contribution.images);
}

// Remove user image
function removeUserImage(objectID, index) {
    const contribution = getUserContribution(objectID);
    if (contribution?.images) {
        contribution.images.splice(index, 1);
        contribution.timestamp = new Date().toISOString();
        userContributions[objectID] = contribution;
        saveUserContributions();
        
        // Reload the modal to show updated content
        const obj = allObjects.find(o => o.objectID === objectID);
        if (obj) {
            showObjectDetail(obj);
        }
    }
}

// Save contribution
async function saveContribution(objectID) {
    const notesInput = document.getElementById(`notesInput_${objectID}`);
    const imageInput = document.getElementById(`imageUpload_${objectID}`);
    
    const notes = notesInput?.value || '';
    const existingContribution = getUserContribution(objectID) || { images: [], notes: '' };
    
    // Process new images
    const newImages = [];
    if (imageInput?.files) {
        for (let file of imageInput.files) {
            try {
                const dataUrl = await readFileAsDataURL(file);
                newImages.push({
                    dataUrl: dataUrl,
                    filename: file.name,
                    uploadDate: new Date().toISOString()
                });
            } catch (error) {
                console.error('Error reading image:', error);
            }
        }
    }
    
    // Combine existing and new images
    const allImages = [...existingContribution.images, ...newImages];
    
    // Save contribution
    userContributions[objectID] = {
        images: allImages,
        notes: notes,
        timestamp: new Date().toISOString()
    };
    
    saveUserContributions();
    
    // Reload the modal to show updated content
    const obj = allObjects.find(o => o.objectID === objectID);
    if (obj) {
        showObjectDetail(obj);
    }
}

// Read file as data URL
function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
    });
}

// Format timestamp for display
function formatTimestamp(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

// Initialize contributions on load
loadUserContributions();

// ============================================================================

// ============================================================================
// TIMESTAMP TRACKING
// ============================================================================

// Update last edit time display
function updateLastEditTime() {
    const lastEdit = localStorage.getItem('met_last_edit_time');
    const timeElement = document.getElementById('lastEditTime');
    
    if (!timeElement) return;
    
    if (lastEdit) {
        const date = new Date(lastEdit);
        const formatted = date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        timeElement.textContent = formatted;
    } else {
        timeElement.textContent = 'Never';
    }
}

// Save timestamp when user makes an edit
function saveEditTimestamp() {
    localStorage.setItem('met_last_edit_time', new Date().toISOString());
    updateLastEditTime();
}

// Override saveContribution to include timestamp
const originalSaveContribution = window.saveContribution;
if (originalSaveContribution) {
    window.saveContribution = function(...args) {
        const result = originalSaveContribution.apply(this, args);
        saveEditTimestamp();
        return result;
    };
}

// Override toggleDocumented to include timestamp
const originalToggleDocumented = window.toggleDocumented;
if (originalToggleDocumented) {
    window.toggleDocumented = function(...args) {
        const result = originalToggleDocumented.apply(this, args);
        saveEditTimestamp();
        return result;
    };
}

// Initialize timestamp display
updateLastEditTime();

// Override createObjectCard for grid tile view
const originalCreateObjectCard = createObjectCard;
createObjectCard = function(obj) {
    const card = document.createElement('div');
    card.className = 'object-card';
    card.onclick = () => showObjectDetail(obj);
    
    const accession = document.createElement('div');
    accession.className = 'tile-accession';
    accession.textContent = obj.accessionNumber || 'Unknown';
    
    card.appendChild(accession);
    return card;
};

// Update createObjectCard for grid tile view with image placeholder
createObjectCard = function(obj) {
    const card = document.createElement('div');
    card.className = 'object-card';
    card.onclick = () => showObjectDetail(obj);
    
    const placeholder = document.createElement('div');
    placeholder.className = 'tile-placeholder';
    
    const accession = document.createElement('div');
    accession.className = 'tile-accession';
    accession.textContent = obj.accessionNumber || 'Unknown';
    
    const placeholderText = document.createElement('div');
    placeholderText.className = 'tile-placeholder-text';
    placeholderText.textContent = 'image coming soon';
    
    placeholder.appendChild(accession);
    placeholder.appendChild(placeholderText);
    card.appendChild(placeholder);
    
    return card;
};

// Department name handling for Ancient Near Eastern / West Asian Art
// The Met renamed this department but hasn't fully standardized the change
const DEPARTMENT_DISPLAY_NAMES = {
    "Ancient Near Eastern Art": "Ancient Near Eastern Art / Ancient West Asian Art",
    "Ancient West Asian Art": "Ancient Near Eastern Art / Ancient West Asian Art"
};

// Function to normalize department names for display
function normalizeDepName(deptName) {
    return DEPARTMENT_DISPLAY_NAMES[deptName] || deptName;
}
