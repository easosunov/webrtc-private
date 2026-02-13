// js/debug-console.js - DEBUG CONSOLE FOR USER FEEDBACK
const DebugConsole = {
    maxEntries: 100,
    entries: [],
    isVisible: true,
    
    init() {
        console.log('Initializing Debug Console...');
        
        // Create container if it doesn't exist
        if (!document.getElementById('debugConsole')) {
            this.createConsole();
        }
        
        // Set up event listeners
        document.getElementById('clearDebugBtn')?.addEventListener('click', () => this.clear());
        document.getElementById('toggleDebugBtn')?.addEventListener('click', () => this.toggle());
        
        // Log initial messages
        this.log('System', 'Debug console initialized');
    },
    
    createConsole() {
        const consoleHTML = `
            <div id="debugConsole" style="margin-top: 20px; border: 1px solid #ccc; border-radius: 5px; background: #f8f9fa; font-family: monospace; font-size: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #e9ecef; border-bottom: 1px solid #ccc; border-radius: 5px 5px 0 0;">
                    <span style="font-weight: bold; color: #495057;">📋 System Log</span>
                    <div>
                        <button id="clearDebugBtn" style="margin-right: 5px; padding: 2px 8px; background: #6c757d; color: white; border: none; border-radius: 3px; cursor: pointer;">Clear</button>
                        <button id="toggleDebugBtn" style="padding: 2px 8px; background: #007bff; color: white; border: none; border-radius: 3px; cursor: pointer;">▼ Hide</button>
                    </div>
                </div>
                <div id="debugContent" style="height: 150px; overflow-y: scroll; padding: 8px; background: #f8f9fa;"></div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', consoleHTML);
    },
    
    log(category, message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        let color = '#000000';
        let icon = 'ℹ️';
        
        switch(type) {
            case 'success':
                color = '#28a745';
                icon = '✅';
                break;
            case 'error':
                color = '#dc3545';
                icon = '❌';
                break;
            case 'warning':
                color = '#ffc107';
                icon = '⚠️';
                break;
            case 'info':
                color = '#007bff';
                icon = 'ℹ️';
                break;
            case 'call':
                color = '#6f42c1';
                icon = '📞';
                break;
            case 'network':
                color = '#17a2b8';
                icon = '🌐';
                break;
        }
        
        const entry = {
            timestamp,
            category,
            message,
            type,
            color,
            icon
        };
        
        this.entries.push(entry);
        if (this.entries.length > this.maxEntries) {
            this.entries.shift();
        }
        
        this.render();
        
        // Also log to console
        console.log(`[${category}] ${message}`);
    },
    
    // Convenience methods
    info(category, message) { this.log(category, message, 'info'); },
    success(category, message) { this.log(category, message, 'success'); },
    error(category, message) { this.log(category, message, 'error'); },
    warning(category, message) { this.log(category, message, 'warning'); },
    call(category, message) { this.log(category, message, 'call'); },
    network(category, message) { this.log(category, message, 'network'); },
    
    clear() {
        this.entries = [];
        this.render();
        this.log('System', 'Console cleared', 'info');
    },
    
    toggle() {
        const content = document.getElementById('debugContent');
        const toggleBtn = document.getElementById('toggleDebugBtn');
        
        if (this.isVisible) {
            content.style.display = 'none';
            toggleBtn.textContent = '▲ Show';
            this.isVisible = false;
        } else {
            content.style.display = 'block';
            toggleBtn.textContent = '▼ Hide';
            this.isVisible = true;
        }
    },
    
    render() {
        const content = document.getElementById('debugContent');
        if (!content) return;
        
        let html = '';
        this.entries.forEach(entry => {
            html += `<div style="color: ${entry.color}; margin-bottom: 2px;">
                <span style="color: #6c757d;">[${entry.timestamp}]</span>
                <span style="margin: 0 4px;">${entry.icon}</span>
                <span style="font-weight: bold;">${entry.category}:</span>
                <span style="margin-left: 4px;">${entry.message}</span>
            </div>`;
        });
        
        content.innerHTML = html;
        content.scrollTop = content.scrollHeight; // Auto-scroll to bottom
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    DebugConsole.init();
});

window.DebugConsole = DebugConsole;
