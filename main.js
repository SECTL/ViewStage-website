console.log('ViewStage');

const toggleBtn = document.querySelector('.vp-toggle-color-mode-button');

function updateThemeIcon() {
    const isDark = document.documentElement.classList.contains('dark');
    toggleBtn.innerHTML = isDark
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg>`;
}

function initTheme() {
    const saved = localStorage.getItem('theme');
    
    if (saved === 'dark') {
        document.documentElement.classList.add('dark');
    }
    updateThemeIcon();
}

toggleBtn.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    const isDark = document.documentElement.classList.contains('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeIcon();
});

function initScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    const featureCards = document.querySelectorAll('.feature-card');
    featureCards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = `opacity 0.6s ease ${index * 0.1}s, transform 0.6s ease ${index * 0.1}s`;
        observer.observe(card);
    });

    const sectionTitle = document.querySelector('.features-section .section-title');
    if (sectionTitle) {
        sectionTitle.style.opacity = '0';
        sectionTitle.style.transform = 'translateY(20px)';
        sectionTitle.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(sectionTitle);
    }

    const showcaseSection = document.querySelector('.showcase-section');
    if (showcaseSection) {
        const showcaseText = showcaseSection.querySelector('.showcase-text');
        const colorPicker = showcaseSection.querySelector('.color-picker-popup-demo');
        
        if (showcaseText) {
            showcaseText.style.opacity = '0';
            showcaseText.style.transform = 'translateY(20px)';
            showcaseText.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            observer.observe(showcaseText);
        }
        
        if (colorPicker) {
            colorPicker.style.opacity = '0';
            colorPicker.style.transform = 'translateY(20px)';
            colorPicker.style.transition = 'opacity 0.6s ease 0.2s, transform 0.6s ease 0.2s';
            observer.observe(colorPicker);
        }
    }
}

function hsvToRgb(h, s, v) {
    s /= 100;
    v /= 100;
    const c = v * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((b + m) * 255)
    };
}

function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = max === 0 ? 0 : (max - min) / max, v = max;
    if (max !== min) {
        const d = max - min;
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        else if (max === g) h = ((b - r) / d + 2) * 60;
        else h = ((r - g) / d + 4) * 60;
    }
    return { h, s: s * 100, v: v * 100 };
}

function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function initColorPicker() {
    const svDemo = document.querySelector('.color-picker-sv-demo');
    const svCursorDemo = document.querySelector('.color-picker-sv-cursor-demo');
    const hueDemo = document.querySelector('.color-picker-hue-demo');
    const hueCursorDemo = document.querySelector('.color-picker-hue-cursor-demo');
    const presetsDemo = document.querySelectorAll('.color-picker-preset-demo');
    const previewDemo = document.querySelector('.color-picker-preview-demo');
    const inputDemo = document.querySelector('.color-picker-input-demo');

    if (!svDemo || !hueDemo) return;

    let currentHue = 0;
    let currentSaturation = 50;
    let currentValue = 50;

    function getCurrentHexColor() {
        const rgb = hsvToRgb(currentHue, currentSaturation, currentValue);
        return rgbToHex(rgb.r, rgb.g, rgb.b);
    }

    function updateColorPickerUI() {
        const rgb = hsvToRgb(currentHue, currentSaturation, currentValue);
        const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
        const svWidth = svDemo.offsetWidth || 280;
        const svHeight = svDemo.offsetHeight || 200;

        if (svCursorDemo) {
            const x = (currentSaturation / 100) * svWidth;
            const y = (1 - currentValue / 100) * svHeight;
            svCursorDemo.style.left = x + 'px';
            svCursorDemo.style.top = y + 'px';
        }

        if (hueCursorDemo) {
            const hueWidth = hueDemo.offsetWidth || 280;
            const hueX = (currentHue / 360) * hueWidth;
            hueCursorDemo.style.left = hueX + 'px';
        }

        const hueRgb = hsvToRgb(currentHue, 100, 100);
        const hueHex = rgbToHex(hueRgb.r, hueRgb.g, hueRgb.b);
        svDemo.style.backgroundColor = hueHex;

        if (previewDemo) {
            previewDemo.style.backgroundColor = hex;
        }

        if (inputDemo) {
            inputDemo.value = hex.toUpperCase();
        }
    }

    function handleSVDrag(e) {
        const rect = svDemo.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        let x = Math.max(0, Math.min(clientX - rect.left, rect.width));
        let y = Math.max(0, Math.min(clientY - rect.top, rect.height));
        currentSaturation = (x / rect.width) * 100;
        currentValue = (1 - y / rect.height) * 100;
        updateColorPickerUI();
    }

    function handleHueDrag(e) {
        const rect = hueDemo.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let x = Math.max(0, Math.min(clientX - rect.left, rect.width));
        currentHue = (x / rect.width) * 360;
        updateColorPickerUI();
    }

    let svDragging = false;
    svDemo.addEventListener('mousedown', (e) => { svDragging = true; handleSVDrag(e); });
    svDemo.addEventListener('touchstart', (e) => { svDragging = true; handleSVDrag(e); }, { passive: true });
    document.addEventListener('mousemove', (e) => { if (svDragging) handleSVDrag(e); });
    document.addEventListener('touchmove', (e) => { if (svDragging) handleSVDrag(e); }, { passive: true });
    document.addEventListener('mouseup', () => { svDragging = false; });
    document.addEventListener('touchend', () => { svDragging = false; });

    let hueDragging = false;
    hueDemo.addEventListener('mousedown', (e) => { hueDragging = true; handleHueDrag(e); });
    hueDemo.addEventListener('touchstart', (e) => { hueDragging = true; handleHueDrag(e); }, { passive: true });
    document.addEventListener('mousemove', (e) => { if (hueDragging) handleHueDrag(e); });
    document.addEventListener('touchmove', (e) => { if (hueDragging) handleHueDrag(e); }, { passive: true });
    document.addEventListener('mouseup', () => { hueDragging = false; });
    document.addEventListener('touchend', () => { hueDragging = false; });

    presetsDemo.forEach(preset => {
        preset.addEventListener('click', () => {
            const color = preset.style.backgroundColor;
            const rgbMatch = color.match(/\d+/g);
            if (rgbMatch && rgbMatch.length >= 3) {
                const r = parseInt(rgbMatch[0]);
                const g = parseInt(rgbMatch[1]);
                const b = parseInt(rgbMatch[2]);
                const hsv = rgbToHsv(r, g, b);
                currentHue = hsv.h;
                currentSaturation = hsv.s;
                currentValue = hsv.v;
                updateColorPickerUI();
            }
        });
    });

    if (inputDemo) {
        inputDemo.addEventListener('input', () => {
            const hex = inputDemo.value;
            if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
                const rgb = hexToRgb(hex);
                if (rgb) {
                    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
                    currentHue = hsv.h;
                    currentSaturation = hsv.s;
                    currentValue = hsv.v;
                    updateColorPickerUI();
                }
            }
        });
    }

    updateColorPickerUI();
}

function initTriangleSliderDemo(wrapper, thumb, valueLabel, minValue, maxValue, initialValue) {
    const wrapperHeight = 50;
    const thumbHeight = 18;
    const validHeight = wrapperHeight - thumbHeight;
    
    let currentValue = initialValue;
    let isDragging = false;
    
    function updateThumbPosition() {
        const ratio = (currentValue - minValue) / (maxValue - minValue);
        const top = (1 - ratio) * validHeight;
        thumb.style.top = `${top}px`;
        valueLabel.textContent = `${currentValue}px`;
    }
    
    function getPositionFromEvent(e) {
        if (e.touches && e.touches.length > 0) {
            return e.touches[0].clientY;
        }
        return e.clientY;
    }
    
    function onDrag(e) {
        if (!isDragging) return;
        e.preventDefault();
        const clientY = getPositionFromEvent(e);
        const mouseY = clientY - wrapper.getBoundingClientRect().top;
        const clampedY = Math.max(0, Math.min(mouseY, validHeight));
        const ratio = 1 - (clampedY / validHeight);
        currentValue = Math.round(minValue + ratio * (maxValue - minValue));
        updateThumbPosition();
    }
    
    function stopDrag() {
        isDragging = false;
        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('mouseup', stopDrag);
        document.removeEventListener('touchmove', onDrag);
        document.removeEventListener('touchend', stopDrag);
        document.removeEventListener('touchcancel', stopDrag);
    }
    
    function startDrag(e) {
        e.preventDefault();
        isDragging = true;
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', stopDrag);
        document.addEventListener('touchmove', onDrag, { passive: false });
        document.addEventListener('touchend', stopDrag);
        document.addEventListener('touchcancel', stopDrag);
    }
    
    thumb.addEventListener('mousedown', startDrag);
    thumb.addEventListener('touchstart', startDrag, { passive: false });
    
    wrapper.addEventListener('click', (e) => {
        if (isDragging) return;
        const clickY = e.clientY - wrapper.getBoundingClientRect().top;
        const ratio = 1 - Math.max(0, Math.min(clickY / validHeight, 1));
        currentValue = Math.round(minValue + ratio * (maxValue - minValue));
        updateThumbPosition();
    });
    
    wrapper.addEventListener('touchstart', (e) => {
        if (e.target === thumb) return;
        const touch = e.touches[0];
        const clickY = touch.clientY - wrapper.getBoundingClientRect().top;
        const ratio = 1 - Math.max(0, Math.min(clickY / validHeight, 1));
        currentValue = Math.round(minValue + ratio * (maxValue - minValue));
        updateThumbPosition();
    }, { passive: true });
    
    updateThumbPosition();
}

function initPenSizeSlider() {
    const sliderWrapper = document.querySelector('.slider-wrapper-demo');
    const thumb = document.querySelector('.custom-thumb-demo');
    const label = document.querySelector('.pen-size-label-demo');
    
    if (!sliderWrapper || !thumb || !label) return;
    
    initTriangleSliderDemo(sliderWrapper, thumb, label, 2, 21, 5);
}

initTheme();
initScrollAnimations();
initColorPicker();
initPenSizeSlider();
