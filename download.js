const GITHUB_REPO = 'SECTL/ViewStage';
const API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).replace(/\//g, '-');
}

async function fetchLatestRelease() {
    const versionEl = document.getElementById('version-number');
    const sizeEl = document.getElementById('file-size');
    const dateEl = document.getElementById('publish-date');
    const downloadBtn = document.getElementById('download-button');

    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('Failed to fetch release');

        const data = await response.json();

        versionEl.textContent = data.tag_name || '未知';
        dateEl.textContent = data.published_at ? formatDate(data.published_at) : '未知';

        const windowsAsset = data.assets?.find(asset => 
            asset.name.toLowerCase().includes('.exe') || 
            asset.name.toLowerCase().includes('windows')
        );

        if (windowsAsset) {
            sizeEl.textContent = formatFileSize(windowsAsset.size);
            downloadBtn.href = windowsAsset.browser_download_url;
        } else {
            sizeEl.textContent = '未知';
            downloadBtn.href = data.html_url;
        }
    } catch (error) {
        console.error('Error fetching release:', error);
        versionEl.textContent = '获取失败';
        sizeEl.textContent = '获取失败';
        dateEl.textContent = '获取失败';
        downloadBtn.href = `https://github.com/${GITHUB_REPO}/releases`;
    }
}

fetchLatestRelease();
