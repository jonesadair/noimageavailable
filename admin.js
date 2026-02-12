// Admin Panel JavaScript
let allObjects = [];
let filteredObjects = [];
let currentObject = null;
let newImages = [];
const ADMIN_PASSWORD = 'metarchive2026'; // Change this to your secure password

// GitHub Configuration - UPDATE THESE AFTER CREATING REPO
const GITHUB_USERNAME = 'YOUR_GITHUB_USERNAME';  // e.g., 'adairjones'
const GITHUB_REPO = 'met-archive';  // Your repo name
const GITHUB_TOKEN = 'YOUR_GITHUB_TOKEN';  // Generate at: github.com/settings/tokens

// Check if already logged in
window.addEventListener('DOMContentLoaded', function() {
    const isLoggedIn = sessionStorage.getItem('admin_logged_in');
    if (isLoggedIn === 'true') {
        showAdminPanel();
    }
});

function login() {
    const password = document.getElementById('passwordInput').value;
    if (password === ADMIN_PASSWORD) {
        sessionStorage.setItem('admin_logged_in', 'true');
        showAdminPanel();
    } else {
        alert('Incorrect password');
    }
}

function logout() {
    sessionStorage.removeItem('admin_logged_in');
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('adminPanel').style.display = 'none';
}

async function showAdminPanel() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    
    // Load data
    await loadData();
    displayObjects(allObjects);
}

async function loadData() {
    try {
        const response = await fetch('all_unpictured_ancient_objects.json');
        const data = await response.json();
        allObjects = Array.isArray(data) ? data : (data.objects || []);
        console.log(`Loaded ${allObjects.length} objects`);
    } catch (error) {
        showMessage('Error loading data: ' + error.message, 'error');
    }
}

function searchObjects() {
    const searchTerm = document.getElementById('adminSearch').value.toLowerCase();
    if (!searchTerm) {
        displayObjects(allObjects);
        return;
    }
    
    filteredObjects = allObjects.filter(obj => {
        return (
            obj.accessionNumber?.toLowerCase().includes(searchTerm) ||
            obj.title?.toLowerCase().includes(searchTerm) ||
            obj.objectID?.toString().includes(searchTerm) ||
            obj.objectName?.toLowerCase().includes(searchTerm)
        );
    });
    
    displayObjects(filteredObjects);
}

function displayObjects(objects) {
    const list = document.getElementById('objectList');
    
    if (objects.length === 0) {
        list.innerHTML = '<p style="color: #ccdacc;">No objects found</p>';
        return;
    }
    
    list.innerHTML = objects.slice(0, 50).map(obj => `
        <div class="object-item" onclick="selectObject(${obj.objectID})">
            <div style="color: #23ff12; font-size: 14px; margin-bottom: 0.5rem;">
                ${obj.accessionNumber || 'No Accession Number'}
            </div>
            <div style="color: #ccdacc; font-size: 12px;">
                ${obj.title || obj.objectName || 'Untitled'}
            </div>
            <div style="color: #aac5be; font-size: 11px; margin-top: 0.25rem;">
                ${obj.department || 'Unknown Department'}
            </div>
            ${obj.userContribution ? '<div style="color: #23ff12; font-size: 10px; margin-top: 0.25rem;">✓ HAS DOCUMENTATION</div>' : ''}
        </div>
    `).join('');
    
    if (objects.length > 50) {
        list.innerHTML += `<p style="color: #ccdacc; padding: 1rem;">Showing first 50 of ${objects.length} results. Use search to narrow down.</p>`;
    }
}

function selectObject(objectID) {
    currentObject = allObjects.find(obj => obj.objectID === objectID);
    if (!currentObject) return;
    
    // Highlight selected
    document.querySelectorAll('.object-item').forEach(el => el.classList.remove('selected'));
    event.currentTarget.classList.add('selected');
    
    // Show editor
    document.getElementById('editorPanel').style.display = 'block';
    document.getElementById('currentObjectTitle').textContent = currentObject.title || currentObject.objectName || 'Untitled';
    document.getElementById('currentAccession').textContent = currentObject.accessionNumber || 'N/A';
    document.getElementById('currentObjectID').textContent = currentObject.objectID;
    
    // Load existing data
    if (currentObject.userContribution) {
        document.getElementById('notesInput').value = currentObject.userContribution.notes || '';
        displayExistingImages();
    } else {
        document.getElementById('notesInput').value = '';
        document.getElementById('imagePreview').innerHTML = '';
    }
    
    newImages = [];
}

function displayExistingImages() {
    const preview = document.getElementById('imagePreview');
    const existing = currentObject.userContribution?.images || [];
    
    preview.innerHTML = existing.map((img, idx) => `
        <div class="image-preview-item">
            <img src="${img.dataUrl}" alt="Image ${idx + 1}">
            <button onclick="removeExistingImage(${idx})">✕</button>
        </div>
    `).join('');
}

function previewImages() {
    const input = document.getElementById('imageInput');
    const preview = document.getElementById('imagePreview');
    
    // Convert FileList to Array
    const files = Array.from(input.files);
    
    // Keep existing images
    let existingHTML = '';
    if (currentObject.userContribution?.images) {
        existingHTML = currentObject.userContribution.images.map((img, idx) => `
            <div class="image-preview-item">
                <img src="${img.url}" alt="Existing ${idx + 1}">
                <button onclick="removeExistingImage(${idx})">✕</button>
            </div>
        `).join('');
    }
    
    // Read new images
    newImages = [];
    files.forEach((file, idx) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            newImages.push({
                name: file.name,
                dataUrl: e.target.result,
                uploadDate: new Date().toISOString(),
                file: file
            });
            
            // Update preview
            const newHTML = newImages.map((img, i) => `
                <div class="image-preview-item">
                    <img src="${img.dataUrl}" alt="New ${i + 1}">
                    <button onclick="removeNewImage(${i})">✕</button>
                </div>
            `).join('');
            
            preview.innerHTML = existingHTML + newHTML;
        };
        reader.readAsDataURL(file);
    });
}

async function uploadImageToGitHub(file, objectID) {
    // Create unique filename
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
    const filename = `${objectID}_${timestamp}_${sanitizedName}`;
    const path = `images/${filename}`;
    
    // Convert file to base64
    const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            // Remove data URL prefix
            const base64String = reader.result.split(',')[1];
            resolve(base64String);
        };
        reader.readAsDataURL(file);
    });
    
    // Upload to GitHub
    const url = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${path}`;
    
    try {
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: `Add image for object ${objectID}`,
                content: base64,
            })
        });
        
        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Return the raw GitHub URL for the image
        return {
            url: `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${GITHUB_REPO}/main/${path}`,
            filename: filename,
            uploadDate: new Date().toISOString()
        };
    } catch (error) {
        console.error('Upload error:', error);
        throw error;
    }
}

function removeExistingImage(index) {
    if (!currentObject.userContribution?.images) return;
    currentObject.userContribution.images.splice(index, 1);
    displayExistingImages();
}

function removeNewImage(index) {
    newImages.splice(index, 1);
    previewImages();
}

async function saveChanges() {
    if (!currentObject) return;
    
    const notes = document.getElementById('notesInput').value;
    
    // Show uploading message
    showMessage('Uploading images to GitHub...', 'success');
    
    try {
        // Upload new images to GitHub
        const uploadedImages = [];
        for (const img of newImages) {
            const uploaded = await uploadImageToGitHub(img.file, currentObject.objectID);
            uploadedImages.push(uploaded);
        }
        
        // Create or update userContribution
        if (!currentObject.userContribution) {
            currentObject.userContribution = {
                images: [],
                notes: '',
                timestamp: new Date().toISOString()
            };
        }
        
        // Add new images (now with GitHub URLs)
        if (uploadedImages.length > 0) {
            currentObject.userContribution.images = [
                ...(currentObject.userContribution.images || []),
                ...uploadedImages
            ];
        }
        
        // Update notes
        currentObject.userContribution.notes = notes;
        currentObject.userContribution.timestamp = new Date().toISOString();
        
        // Save to JSON (download for now)
        downloadJSON();
        
        showMessage(`Success! ${uploadedImages.length} image(s) uploaded to GitHub. Download the updated JSON and upload it to GitHub.`, 'success');
        
        // Refresh display
        searchObjects();
        displayExistingImages();
        newImages = [];
        document.getElementById('imageInput').value = '';
        
    } catch (error) {
        showMessage('Error uploading images: ' + error.message + '. Make sure your GitHub token is configured correctly.', 'error');
    }
}

function downloadJSON() {
    const dataStr = JSON.stringify(allObjects, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'all_unpictured_ancient_objects.json';
    link.click();
    URL.revokeObjectURL(url);
}

function showMessage(message, type) {
    const messageArea = document.getElementById('messageArea');
    messageArea.innerHTML = `
        <div class="${type}-message">
            ${message}
        </div>
    `;
    
    setTimeout(() => {
        messageArea.innerHTML = '';
    }, 5000);
}
