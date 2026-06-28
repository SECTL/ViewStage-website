const GITHUB_REPO = 'SECTL/ViewStage';
const API_URL_RELEASES = `https://api.github.com/repos/${GITHUB_REPO}/releases`;
const PER_PAGE = 30;
const MIRROR_SOURCES = [
  { id: 'sectl', label: 'SECTL 镜像', url: 'https://appwrite.sectl.cn/api/software/download?projectSlug=ViewStage&source=server&fileName=' },
  { id: 'direct', label: 'GitHub', url: null },
  { id: 'ghproxy', label: 'gh-proxy', url: 'https://gh-proxy.com/' },
];

const PLATFORM_CONFIG = {
  windows: { label: 'Windows', icon: 'windows', detect: /win/i },
  linux: { label: 'Linux', icon: 'linux', detect: /linux/i },
  macos: { label: 'macOS', icon: 'macos', detect: /mac/i },
};

const FORMAT_DISPLAY = {
  exe: { label: '安装程序', ext: '.exe', rank: 0 },
  msi: { label: '安装包', ext: '.msi', rank: 1 },
  deb: { label: 'DEB 包', ext: '.deb', rank: 0 },
  appimage: { label: 'AppImage', ext: '.AppImage', rank: 1 },
  dmg: { label: 'DMG 镜像', ext: '.dmg', rank: 0 },
};

const PLATFORM_FORMATS = {
  windows: ['exe', 'msi'],
  linux: ['deb', 'appimage'],
  macos: ['dmg'],
};

const state = {
  releases_all: [],
  current_release: null,
  current_tag: '',
  organized_assets: null,
  current_platform: '',
  current_arch: '',
  current_format: '',
  use_compat: false,
  mirror_source: 'sectl',
  current_asset: null,
  is_loading: true,
  is_version_list_expanded: false,
};

function format_file_size(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function format_date(date_string) {
  const date = new Date(date_string);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).replace(/\//g, '-');
}

function render_markdown_simple(md) {
  if (!md) return '<p class="changelog-empty">暂无更新说明</p>';
  let html = '';
  const lines = md.split('\n');
  let in_list = false;
  let list_type = '';

  for (let raw of lines) {
    const line = raw.trimEnd();
    if (!line) {
      if (in_list) { html += list_type === 'ul' ? '</ul>\n' : '</ol>\n'; in_list = false; list_type = ''; }
      continue;
    }

    const header_match = line.match(/^(#{1,3})\s+(.+)/);
    if (header_match) {
      if (in_list) { html += list_type === 'ul' ? '</ul>\n' : '</ol>\n'; in_list = false; list_type = ''; }
      const level = header_match[1].length;
      const text = header_match[2];
      const tag = level <= 2 ? 'h3' : 'h4';
      html += `<${tag} class="changelog-heading">${escape_html(text)}</${tag}>\n`;
      continue;
    }

    const ul_match = line.match(/^[-*]\s+(.+)/);
    if (ul_match) {
      if (!in_list || list_type !== 'ul') {
        if (in_list) html += '</ul>\n';
        html += '<ul class="changelog-list">\n';
        in_list = true;
        list_type = 'ul';
      }
      html += `<li>${render_inline(ul_match[1])}</li>\n`;
      continue;
    }

    const ol_match = line.match(/^\d+[.)]\s+(.+)/);
    if (ol_match) {
      if (!in_list || list_type !== 'ol') {
        if (in_list) html += '</ol>\n';
        html += '<ol class="changelog-list">\n';
        in_list = true;
        list_type = 'ol';
      }
      html += `<li>${render_inline(ol_match[1])}</li>\n`;
      continue;
    }

    if (in_list) { html += list_type === 'ul' ? '</ul>\n' : '</ol>\n'; in_list = false; list_type = ''; }
    html += `<p class="changelog-paragraph">${render_inline(line)}</p>\n`;
  }

  if (in_list) html += list_type === 'ul' ? '</ul>\n' : '</ol>\n';
  return html;
}

function escape_html(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function render_inline(text) {
  let result = escape_html(text);
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/`(.+?)`/g, '<code>$1</code>');
  result = result.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return result;
}

function parse_asset_info(asset) {
  const name = asset.name;
  let platform = null, arch = null, format = null, is_compat = false;

  if (/win|\.exe|\.msi/i.test(name)) platform = 'windows';
  else if (/linux|\.deb|\.AppImage/i.test(name)) platform = 'linux';
  else if (/mac|darwin|\.dmg/i.test(name)) platform = 'macos';

  if (/x64|amd64/i.test(name)) arch = 'x64';
  else if (/x86/i.test(name) && !/x64/i.test(name)) arch = 'x86';
  else if (/arm64|aarch64/i.test(name)) arch = 'arm64';
  else arch = 'x64';

  if (/\.exe$/i.test(name)) format = 'exe';
  else if (/\.msi$/i.test(name)) format = 'msi';
  else if (/\.deb$/i.test(name)) format = 'deb';
  else if (/\.AppImage$/i.test(name)) format = 'appimage';
  else if (/\.dmg$/i.test(name)) format = 'dmg';

  if (/compat|win7/i.test(name)) is_compat = true;

  return { platform, arch, format, is_compat };
}

function organize_assets_by_platform(assets) {
  const result = {};
  if (!assets) return result;

  for (const asset of assets) {
    const info = parse_asset_info(asset);
    if (!info.platform || !info.format) continue;

    const p = info.platform;
    const a = info.arch || 'x64';
    const compat_key = info.is_compat ? 'compat' : 'standard';

    if (!result[p]) result[p] = {};
    if (!result[p][a]) result[p][a] = { standard: {}, compat: {} };

    result[p][a][compat_key][info.format] = {
      name: asset.name,
      size: asset.size,
      url: asset.browser_download_url,
      format: info.format,
    };
  }

  return result;
}

function detect_user_platform() {
  const ua = navigator.userAgent;
  for (const [key, config] of Object.entries(PLATFORM_CONFIG)) {
    if (config.detect.test(ua)) return key;
  }
  return 'windows';
}

function get_available_archs(organized, platform) {
  if (!organized || !organized[platform]) return [];
  return Object.keys(organized[platform]).sort();
}

function get_available_formats(organized, platform, arch, use_compat) {
  if (!organized || !organized[platform] || !organized[platform][arch]) return [];
  const compat_key = use_compat ? 'compat' : 'standard';
  const formats = organized[platform][arch][compat_key];
  if (!formats) return [];
  const allowed = PLATFORM_FORMATS[platform] || [];
  return allowed.filter(f => formats[f]).sort((a, b) => {
    const ra = FORMAT_DISPLAY[a]?.rank ?? 99;
    const rb = FORMAT_DISPLAY[b]?.rank ?? 99;
    return ra - rb;
  });
}

function get_current_asset() {
  const { organized_assets, current_platform, current_arch, current_format, use_compat } = state;
  if (!organized_assets || !current_platform || !current_arch || !current_format) return null;
  const compat_key = use_compat ? 'compat' : 'standard';
  return organized_assets[current_platform]?.[current_arch]?.[compat_key]?.[current_format] || null;
}

function get_platforms_list(organized) {
  if (!organized) return [];
  return Object.keys(organized).sort((a, b) => {
    const order = ['windows', 'macos', 'linux'];
    return order.indexOf(a) - order.indexOf(b);
  });
}

async function fetch_releases_all() {
  try {
    const url = `${API_URL_RELEASES}?per_page=${PER_PAGE}&page=1`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch releases');
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching releases:', error);
    return [];
  }
}

function set_state(updates) {
  Object.assign(state, updates);
  render();
}

function render() {
  render_version_info();
  render_changelog();
  render_version_list();

  if (state.current_release && state.organized_assets) {
    render_download_options();
    render_download_action();
    render_mirror_option();
  } else {
    hide_download_options();
  }
}

function hide_download_options() {
  const options_el = document.getElementById('download-options');
  const action_el = document.getElementById('download-action');
  const error_el = document.getElementById('download-error');
  const placeholder_el = document.getElementById('download-options-placeholder');

  if (state.is_loading && state.releases_all.length === 0) {
    if (placeholder_el) placeholder_el.style.display = '';
  } else {
    if (placeholder_el) placeholder_el.style.display = 'none';
    if (error_el) {
      error_el.style.display = 'flex';
      error_el.querySelector('span').textContent = '请选择一个版本';
    }
  }
  if (options_el) options_el.style.display = 'none';
  if (action_el) action_el.style.display = 'none';
}

function render_version_info() {
  const version_el = document.getElementById('version-number');
  const date_el = document.getElementById('publish-date');
  const platforms_el = document.getElementById('supported-platforms');

  if (!state.current_release) {
    if (version_el) version_el.textContent = state.is_loading ? '加载中...' : '—';
    if (date_el) date_el.textContent = state.is_loading ? '加载中...' : '—';
    if (platforms_el) platforms_el.textContent = state.is_loading ? '加载中...' : '—';
    return;
  }

  const release = state.current_release;
  if (version_el) version_el.textContent = release.tag_name || '未知';
  if (date_el) date_el.textContent = release.published_at ? format_date(release.published_at) : '未知';

  const platforms = get_platforms_list(state.organized_assets);
  if (platforms_el) {
    platforms_el.innerHTML = platforms.map(p => {
      const config = PLATFORM_CONFIG[p];
      return `<span class="platform-tag">${config?.label || p}</span>`;
    }).join('') || '<span class="text-muted">暂无可用平台</span>';
  }
}

function render_changelog() {
  const container = document.getElementById('changelog-content');
  if (!container) return;

  if (!state.current_release) {
    container.innerHTML = '<p class="changelog-loading">选择版本查看更新内容</p>';
    return;
  }

  const body = state.current_release.body;
  container.innerHTML = render_markdown_simple(body);
}

function render_download_options() {
  const options_el = document.getElementById('download-options');
  const placeholder_el = document.getElementById('download-options-placeholder');
  const error_el = document.getElementById('download-error');

  if (placeholder_el) placeholder_el.style.display = 'none';
  if (error_el) error_el.style.display = 'none';

  const organized = state.organized_assets;
  if (!organized || Object.keys(organized).length === 0) {
    if (options_el) options_el.style.display = 'none';
    if (error_el) {
      error_el.style.display = 'flex';
      error_el.querySelector('span').textContent = '该版本暂无可用下载文件';
    }
    return;
  }

  if (options_el) options_el.style.display = '';

  const platforms = get_platforms_list(organized);
  if (platforms.length === 0) {
    if (options_el) options_el.style.display = 'none';
    if (error_el) {
      error_el.style.display = 'flex';
      error_el.querySelector('span').textContent = '该版本暂无可用下载文件';
    }
    return;
  }

  const user_platform = detect_user_platform();
  let selected_platform = state.current_platform;

  if (!selected_platform || !platforms.includes(selected_platform)) {
    selected_platform = platforms.includes(user_platform) ? user_platform : platforms[0];
    state.current_platform = selected_platform;
  }

  render_platform_options(platforms, selected_platform);

  const archs = get_available_archs(organized, selected_platform);
  let selected_arch = state.current_arch;
  if (!selected_arch || !archs.includes(selected_arch)) {
    selected_arch = archs[0] || '';
    state.current_arch = selected_arch;
  }

  render_arch_options(archs, selected_arch, organized, selected_platform);

  const formats = get_available_formats(organized, selected_platform, selected_arch, state.use_compat);
  let selected_format = state.current_format;
  if (!selected_format || !formats.includes(selected_format)) {
    selected_format = formats[0] || '';
    state.current_format = selected_format;
  }

  render_format_options(formats, selected_format);
}

function render_platform_options(platforms, selected) {
  const container = document.getElementById('platform-selector');
  if (!container) return;

  const organized = state.organized_assets;
  let html = '';
  for (const p of platforms) {
    const config = PLATFORM_CONFIG[p];
    const is_active = p === selected && !state.use_compat;
    html += `<button class="option-btn platform-btn${is_active ? ' active' : ''}" data-platform="${p}" role="radio" aria-checked="${is_active}">
      <span class="platform-icon">${get_platform_icon(p)}</span>
      <span>${config?.label || p}</span>
    </button>`;

    if (p === 'windows' && organized && organized.windows) {
      const has_compat = Object.values(organized.windows).some(arch => arch.compat && Object.keys(arch.compat).length > 0);
      if (has_compat) {
        const is_compat_active = p === selected && state.use_compat;
        html += `<button class="option-btn platform-btn${is_compat_active ? ' active' : ''}" data-platform="${p}" data-compat="true" role="radio" aria-checked="${is_compat_active}">
          <span class="platform-icon">${get_platform_icon(p)}</span>
          <span>Windows 7</span>
        </button>`;
      }
    }
  }
  container.innerHTML = html;
}

function get_platform_icon(platform) {
  const icons = {
    windows: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14" fill="currentColor"><path d="M 7.251852,7.25185 13,7.25185 13,13 7.251852,13 Z m -6.251852,0 5.748148,0 0,5.74815 L 1,13 Z M 7.251852,1 13,1 l 0,5.74815 -5.748148,0 z M 1,1 l 5.748148,0 0,5.74815 -5.748148,0 z"/></svg>`,
    linux: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 304.998 304.998" fill="currentColor"><path d="M274.659,244.888c-8.944-3.663-12.77-8.524-12.4-15.777c0.381-8.466-4.422-14.667-6.703-17.117c1.378-5.264,5.405-23.474,0.004-39.291c-5.804-16.93-23.524-42.787-41.808-68.204c-7.485-10.438-7.839-21.784-8.248-34.922c-0.392-12.531-0.834-26.735-7.822-42.525C190.084,9.859,174.838,0,155.851,0c-11.295,0-22.889,3.53-31.811,9.684c-18.27,12.609-15.855,40.1-14.257,58.291c0.219,2.491,0.425,4.844,0.545,6.853c1.064,17.816,0.096,27.206-1.17,30.06c-0.819,1.865-4.851,7.173-9.118,12.793c-4.413,5.812-9.416,12.4-13.517,18.539c-4.893,7.387-8.843,18.678-12.663,29.597c-2.795,7.99-5.435,15.537-8.005,20.047c-4.871,8.676-3.659,16.766-2.647,20.505c-1.844,1.281-4.508,3.803-6.757,8.557c-2.718,5.8-8.233,8.917-19.701,11.122c-5.27,1.078-8.904,3.294-10.804,6.586c-2.765,4.791-1.259,10.811,0.115,14.925c2.03,6.048,0.765,9.876-1.535,16.826c-0.53,1.604-1.131,3.42-1.74,5.423c-0.959,3.161-0.613,6.035,1.026,8.542c4.331,6.621,16.969,8.956,29.979,10.492c7.768,0.922,16.27,4.029,24.493,7.035c8.057,2.944,16.388,5.989,23.961,6.913c1.151,0.145,2.291,0.218,3.39,0.218c11.434,0,16.6-7.587,18.238-10.704c4.107-0.838,18.272-3.522,32.871-3.882c14.576-0.416,28.679,2.462,32.674,3.357c1.256,2.404,4.567,7.895,9.845,10.724c2.901,1.586,6.938,2.495,11.073,2.495c0.001,0,0,0,0.001,0c4.416,0,12.817-1.044,19.466-8.039c6.632-7.028,23.202-16,35.302-22.551c2.7-1.462,5.226-2.83,7.441-4.065c6.797-3.768,10.506-9.152,10.175-14.771C282.445,250.905,279.356,246.811,274.659,244.888z M124.189,243.535c-0.846-5.96-8.513-11.871-17.392-18.715c-7.26-5.597-15.489-11.94-17.756-17.312c-4.685-11.082-0.992-30.568,5.447-40.602c3.182-5.024,5.781-12.643,8.295-20.011c2.714-7.956,5.521-16.182,8.66-19.783c4.971-5.622,9.565-16.561,10.379-25.182c4.655,4.444,11.876,10.083,18.547,10.083c1.027,0,2.024-0.134,2.977-0.403c4.564-1.318,11.277-5.197,17.769-8.947c5.597-3.234,12.499-7.222,15.096-7.585c4.453,6.394,30.328,63.655,32.972,82.044c2.092,14.55-0.118,26.578-1.229,31.289c-0.894-0.122-1.96-0.221-3.08-0.221c-7.207,0-9.115,3.934-9.612,6.283c-1.278,6.103-1.413,25.618-1.427,30.003c-2.606,3.311-15.785,18.903-34.706,21.706c-7.707,1.12-14.904,1.688-21.39,1.688c-5.544,0-9.082-0.428-10.551-0.651l-9.508-10.879C121.429,254.489,125.177,250.583,124.189,243.535z M136.254,64.149c-0.297,0.128-0.589,0.265-0.876,0.411c-0.029-0.644-0.096-1.297-0.199-1.952c-1.038-5.975-5-10.312-9.419-10.312c-0.327,0-0.656,0.025-1.017,0.08c-2.629,0.438-4.691,2.413-5.821,5.213c0.991-6.144,4.472-10.693,8.602-10.693c4.85,0,8.947,6.536,8.947,14.272C136.471,62.143,136.4,63.113,136.254,64.149z M173.94,68.756c0.444-1.414,0.684-2.944,0.684-4.532c0-7.014-4.45-12.509-10.131-12.509c-5.552,0-10.069,5.611-10.069,12.509c0,0.47,0.023,0.941,0.067,1.411c-0.294-0.113-0.581-0.223-0.861-0.329c-0.639-1.935-0.962-3.954-0.962-6.015c0-8.387,5.36-15.211,11.95-15.211c6.589,0,11.95,6.824,11.95,15.211C176.568,62.78,175.605,66.11,173.94,68.756z M169.081,85.08c-0.095,0.424-0.297,0.612-2.531,1.774c-1.128,0.587-2.532,1.318-4.289,2.388l-1.174,0.711c-4.718,2.86-15.765,9.559-18.764,9.952c-2.037,0.274-3.297-0.516-6.13-2.441c-0.639-0.435-1.319-0.897-2.044-1.362c-5.107-3.351-8.392-7.042-8.763-8.485c1.665-1.287,5.792-4.508,7.905-6.415c4.289-3.988,8.605-6.668,10.741-6.668c0.113,0,0.215,0.008,0.321,0.028c2.51,0.443,8.701,2.914,13.223,4.718c2.09,0.834,3.895,1.554,5.165,2.01C166.742,82.664,168.828,84.422,169.081,85.08z M205.028,271.45c2.257-10.181,4.857-24.031,4.436-32.196c-0.097-1.855-0.261-3.874-0.42-5.826c-0.297-3.65-0.738-9.075-0.283-10.684c0.09-0.042,0.19-0.078,0.301-0.109c0.019,4.668,1.033,13.979,8.479,17.226c2.219,0.968,4.755,1.458,7.537,1.458c7.459,0,15.735-3.659,19.125-7.049c1.996-1.996,3.675-4.438,4.851-6.372c0.257,0.753,0.415,1.737,0.332,3.005c-0.443,6.885,2.903,16.019,9.271,19.385l0.927,0.487c2.268,1.19,8.292,4.353,8.389,5.853c-0.001,0.001-0.051,0.177-0.387,0.489c-1.509,1.379-6.82,4.091-11.956,6.714c-9.111,4.652-19.438,9.925-24.076,14.803c-6.53,6.872-13.916,11.488-18.376,11.488c-0.537,0-1.026-0.068-1.461-0.206C206.873,288.406,202.886,281.417,205.028,271.45z M39.917,245.477c-0.494-2.312-0.884-4.137-0.465-5.905c0.304-1.31,6.771-2.714,9.533-3.313c3.883-0.843,7.899-1.714,10.525-3.308c3.551-2.151,5.474-6.118,7.17-9.618c1.228-2.531,2.496-5.148,4.005-6.007c0.085-0.05,0.215-0.108,0.463-0.108c2.827,0,8.759,5.943,12.177,11.262c0.867,1.341,2.473,4.028,4.331,7.139c5.557,9.298,13.166,22.033,17.14,26.301c3.581,3.837,9.378,11.214,7.952,17.541c-1.044,4.909-6.602,8.901-7.913,9.784c-0.476,0.108-1.065,0.163-1.758,0.163c-7.606,0-22.662-6.328-30.751-9.728l-1.197-0.503c-4.517-1.894-11.891-3.087-19.022-4.241c-5.674-0.919-13.444-2.176-14.732-3.312c-1.044-1.171,0.167-4.978,1.235-8.337c0.769-2.414,1.563-4.91,1.998-7.523C41.225,251.596,40.499,248.203,39.917,245.477z"/></svg>`,
    macos: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4.25 3C3.00736 3 2 4.00736 2 5.25V15.75C2 16.9926 3.00736 18 4.25 18H9.5V19.25C9.5 19.9404 8.94036 20.5 8.25 20.5H7.75C7.33579 20.5 7 20.8358 7 21.25C7 21.6642 7.33579 22 7.75 22H16.25C16.6642 22 17 21.6642 17 21.25C17 20.8358 16.6642 20.5 16.25 20.5H15.75C15.0596 20.5 14.5 19.9404 14.5 19.25V18H19.75C20.9926 18 22 16.9926 22 15.75V5.25C22 4.00736 20.9926 3 19.75 3H4.25ZM13 18V19.25C13 19.7001 13.1081 20.125 13.2999 20.5H10.7001C10.8919 20.125 11 19.7001 11 19.25V18H13ZM3.5 5.25C3.5 4.83579 3.83579 4.5 4.25 4.5H19.75C20.1642 4.5 20.5 4.83579 20.5 5.25V13H3.5V5.25ZM3.5 14.5H20.5V15.75C20.5 16.1642 20.1642 16.5 19.75 16.5H4.25C3.83579 16.5 3.5 16.1642 3.5 15.75V14.5Z"/></svg>`,
  };
  return icons[platform] || '';
}

function render_arch_options(archs, selected, organized, platform) {
  const group = document.getElementById('arch-group');
  const container = document.getElementById('arch-selector');
  if (!group || !container) return;

  if (archs.length <= 1) {
    group.style.display = 'none';
    return;
  }

  group.style.display = '';
  let html = '';
  for (const a of archs) {
    const is_active = a === selected;
    html += `<button class="option-btn arch-btn${is_active ? ' active' : ''}" data-arch="${a}" role="radio" aria-checked="${is_active}">${a}</button>`;
  }
  container.innerHTML = html;
}

function render_format_options(formats, selected) {
  const container = document.getElementById('format-selector');
  if (!container) return;

  let html = '';
  for (const f of formats) {
    const display = FORMAT_DISPLAY[f];
    if (!display) continue;
    const is_active = f === selected;
    html += `<button class="option-btn format-btn${is_active ? ' active' : ''}" data-format="${f}" role="radio" aria-checked="${is_active}">
      <span class="format-ext">${display.ext}</span>
      <span class="format-label">${display.label}</span>
    </button>`;
  }
  container.innerHTML = html;
}

function render_mirror_option() {
  const container = document.getElementById('mirror-selector');
  if (!container) return;

  let html = '';
  for (const m of MIRROR_SOURCES) {
    const is_active = m.id === state.mirror_source;
    html += `<button class="option-btn mirror-btn${is_active ? ' active' : ''}" data-mirror="${m.id}" role="radio" aria-checked="${is_active}">
      ${m.id === 'direct' ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>'}
      <span>${m.label}</span>
    </button>`;
  }
  container.innerHTML = html;
}

function render_download_action() {
  const action_el = document.getElementById('download-action');
  const error_el = document.getElementById('download-error');
  if (!action_el) return;

  const asset = get_current_asset();
  state.current_asset = asset;

  if (!asset) {
    action_el.style.display = 'none';
    if (error_el) {
      error_el.style.display = 'flex';
      error_el.querySelector('span').textContent = '未找到匹配的下载文件';
    }
    return;
  }

  if (error_el) error_el.style.display = 'none';
  action_el.style.display = '';

  const btn = document.getElementById('download-button');
  const text_el = document.getElementById('download-button-text');
  const badge = document.getElementById('file-size-badge');
  const meta = document.getElementById('download-meta');

  const mirror_config = MIRROR_SOURCES.find(m => m.id === state.mirror_source);
  const use_mirror = mirror_config && mirror_config.url;
  let download_url;
  if (state.mirror_source === 'sectl') {
    download_url = mirror_config.url + encodeURIComponent(asset.name);
  } else {
    download_url = use_mirror ? mirror_config.url + asset.url : asset.url;
  }
  if (btn) btn.href = download_url;
  if (text_el) {
    const display = FORMAT_DISPLAY[asset.format];
    const prefix = use_mirror ? '镜像下载 ' : '下载 ';
    text_el.textContent = prefix + (display?.label || asset.format) + ' ';
  }
  if (badge) badge.textContent = format_file_size(asset.size);

  if (meta) {
    const release = state.current_release;
    const ver = release?.tag_name || '';
    const mirror_config = MIRROR_SOURCES.find(m => m.id === state.mirror_source);
    const mirror_suffix = mirror_config && mirror_config.url ? ` [${mirror_config.label}]` : '';
    meta.textContent = `${ver} · ${asset.name}${mirror_suffix}`;
  }
}

function render_version_list() {
  const container = document.getElementById('version-list');
  const count_el = document.getElementById('version-list-count');
  if (!container) return;

  if (state.releases_all.length === 0) {
    container.innerHTML = '<div class="version-list-loading"><div class="loading-spinner"></div><span>加载版本列表...</span></div>';
    return;
  }

  if (count_el) count_el.textContent = `共 ${state.releases_all.length} 个版本`;

  const expanded = state.is_version_list_expanded;
  const default_show_count = 2;
  const releases_to_show = expanded ? state.releases_all : state.releases_all.slice(0, default_show_count);
  const hidden_count = state.releases_all.length - default_show_count;

  let html = '';
  for (const release of releases_to_show) {
    const tag = release.tag_name;
    const date = release.published_at ? format_date(release.published_at) : '未知';
    const organized = organize_assets_by_platform(release.assets);
    const platforms = get_platforms_list(organized);
    const is_current = tag === state.current_tag;

    html += `<div class="version-list-item${is_current ? ' current' : ''}" data-tag="${tag}">
      <div class="version-list-item-left">
        <span class="version-list-tag">${tag}</span>
        <span class="version-list-date">${date}</span>
      </div>
      <div class="version-list-item-center">
        ${platforms.map(p => `<span class="platform-tag">${PLATFORM_CONFIG[p]?.label || p}</span>`).join('')}
      </div>
      <div class="version-list-item-right">
        ${is_current ? '<span class="version-list-badge">当前</span>' : ''}
      </div>
    </div>`;
  }

  if (!expanded && hidden_count > 0) {
    html += `<div class="version-list-expand" id="version-list-expand">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
      <span>展开全部 ${hidden_count} 个历史版本</span>
    </div>`;
  }

  if (expanded) {
    html += `<div class="version-list-collapse" id="version-list-collapse">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
      <span>收起版本列表</span>
    </div>`;
  }

  container.innerHTML = html;
}

function setup_event_listeners() {
  document.addEventListener('click', function (e) {
    const platform_btn = e.target.closest('.platform-btn');
    if (platform_btn && !platform_btn.classList.contains('active')) {
      const platform = platform_btn.dataset.platform;
      const organized = state.organized_assets;
      if (!organized || !organized[platform]) return;

      const use_compat = platform_btn.dataset.compat === 'true';
      const archs = get_available_archs(organized, platform);
      const default_arch = archs[0] || '';
      const formats = get_available_formats(organized, platform, default_arch, use_compat);
      const default_format = formats[0] || '';

      state.current_format = '';
      set_state({
        current_platform: platform,
        current_arch: default_arch,
        current_format: default_format,
        use_compat: use_compat,
      });
      return;
    }

    const arch_btn = e.target.closest('.arch-btn');
    if (arch_btn && !arch_btn.classList.contains('active')) {
      const arch = arch_btn.dataset.arch;
      const organized = state.organized_assets;
      const platform = state.current_platform;
      if (!organized || !platform) return;

      const formats = get_available_formats(organized, platform, arch, state.use_compat);
      const default_format = formats[0] || '';

      set_state({
        current_arch: arch,
        current_format: default_format,
      });
      return;
    }

    const format_btn = e.target.closest('.format-btn');
    if (format_btn && !format_btn.classList.contains('active')) {
      set_state({ current_format: format_btn.dataset.format });
      return;
    }

    const version_item = e.target.closest('.version-list-item');
    if (version_item) {
      const tag = version_item.dataset.tag;
      if (!tag || tag === state.current_tag) return;
      const release = state.releases_all.find(r => r.tag_name === tag);
      if (!release) return;
      const organized = organize_assets_by_platform(release.assets);
      set_state({
        current_release: release,
        current_tag: tag,
        organized_assets: organized,
        current_platform: '',
        current_arch: '',
        current_format: '',
        use_compat: false,
        current_asset: null,
      });
      document.querySelector('.download-page').scrollIntoView({ behavior: 'smooth' });
      return;
    }

    const expand_btn = e.target.closest('#version-list-expand');
    if (expand_btn) {
      set_state({ is_version_list_expanded: true });
      return;
    }

    const collapse_btn = e.target.closest('#version-list-collapse');
    if (collapse_btn) {
      set_state({ is_version_list_expanded: false });
      return;
    }
  });

  document.addEventListener('click', function (e) {
    const mirror_btn = e.target.closest('.mirror-btn');
    if (mirror_btn && !mirror_btn.classList.contains('active')) {
      set_state({ mirror_source: mirror_btn.dataset.mirror });
    }
  });
}

async function init() {
  const releases = await fetch_releases_all();

  if (releases.length === 0) {
    state.is_loading = false;
    const version_el = document.getElementById('version-number');
    const date_el = document.getElementById('publish-date');
    const platforms_el = document.getElementById('supported-platforms');
    if (version_el) version_el.textContent = '获取失败';
    if (date_el) date_el.textContent = '获取失败';
    if (platforms_el) platforms_el.textContent = '获取失败';

    const version_list = document.getElementById('version-list');
    if (version_list) version_list.innerHTML = '<div class="version-list-loading"><span>获取版本列表失败，请刷新重试</span></div>';

    const btn = document.getElementById('download-button');
    if (btn) btn.href = `https://github.com/${GITHUB_REPO}/releases`;

    const placeholder = document.getElementById('download-options-placeholder');
    if (placeholder) {
      placeholder.innerHTML = '<span style="color:var(--text-muted)">无法获取版本信息</span>';
    }
    return;
  }

  state.releases_all = releases;
  state.is_loading = false;

  const latest = releases[0];
  const organized = organize_assets_by_platform(latest.assets);

  state.current_release = latest;
  state.current_tag = latest.tag_name;
  state.organized_assets = organized;

  if (organized && Object.keys(organized).length > 0) {
    const user_platform = detect_user_platform();
    const platforms = get_platforms_list(organized);
    const default_platform = platforms.includes(user_platform) ? user_platform : platforms[0];
    const archs = get_available_archs(organized, default_platform);
    const default_arch = archs[0] || '';
    const formats = get_available_formats(organized, default_platform, default_arch, false);
    const default_format = formats[0] || '';

    state.current_platform = default_platform;
    state.current_arch = default_arch;
    state.current_format = default_format;
  }

  setup_event_listeners();
  render();
}

init();
