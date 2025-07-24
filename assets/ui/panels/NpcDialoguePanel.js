console.log('[NpcDialoguePanel] Registering npc-dialogue template...');

class NpcDialoguePanel {
    constructor() {
        this.templateId = 'npc-dialogue-template';
        this.templateName = 'npc-dialogue';
        this.playerId = null;
    }

    initialize() {
        this.injectTemplateAndStyles();
        this.registerSceneUITemplate();
        hytopia.onData((data) => {
            if (data.type === 'playerIdentity') {
                this.playerId = data.playerId;
            }
        });
    }

    injectTemplateAndStyles() {
        if (!document.getElementById(this.templateId)) {
            const templateElement = document.createElement('template');
            templateElement.id = this.templateId;
            templateElement.innerHTML = `
                <div class="dialogue-bubble">
                  <div class="dialogue-text"></div>
                  <div class="dialogue-caret"></div>
                </div>
            `;
            document.body.appendChild(templateElement);
        }
        const styleId = 'npc-dialogue-styles';
        if (!document.getElementById(styleId)) {
            const styleElement = document.createElement('style');
            styleElement.id = styleId;
            styleElement.textContent = `
              .dialogue-bubble {
                background-color: rgba(255, 255, 255, 0.8);
                padding: 10px 15px;
                border-radius: 8px;
                text-align: center;
                color: #333333;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
                font-family: Arial, sans-serif;
                font-size: 14px;
                position: relative;
                max-width: 200px;
                margin: 0 auto;
                display: none;
              }
              .dialogue-caret {
                position: absolute;
                bottom: -8px;
                left: 50%;
                transform: translateX(-50%);
                width: 0;
                height: 0;
                border-left: 8px solid transparent;
                border-right: 8px solid transparent;
                border-top: 8px solid rgba(255, 255, 255, 0.8);
              }
            `;
            document.head.appendChild(styleElement);
        }
    }

    registerSceneUITemplate() {
        hytopia.registerSceneUITemplate('npc-dialogue', (id, onState) => {
          const element = document.createElement('div');
          element.className = 'npc-dialogue-bubble';
          element.style.padding = '10px 16px';
          element.style.background = '#b39ddb'; // Soft off-purple (Easter-like)
          element.style.border = '4px solid #9575cd'; // Slightly deeper purple border
          element.style.borderRadius = '18px';
          element.style.fontFamily = "'Comic Neue', 'Comic Sans MS', 'Arial Rounded MT Bold', 'Fredoka One', 'Baloo', 'Quicksand', sans-serif";
          element.style.fontSize = '16px';
          element.style.fontWeight = 'bold';
          element.style.color = '#fff'; // White text
          element.style.boxShadow = '0 6px 24px rgba(0,0,0,0.18)';
          element.style.textShadow = '2px 2px 0 #9575cd, 0 0 6px #fff';
          element.style.maxWidth = '220px';
          element.style.textAlign = 'center';
          element.style.whiteSpace = 'pre-line';
          element.style.animation = 'cartoon-pop 0.3s cubic-bezier(.68,-0.55,.27,1.55)';

          // Inject animation CSS if not present
          if (!document.getElementById('cartoon-pop-style')) {
            const style = document.createElement('style');
            style.id = 'cartoon-pop-style';
            style.textContent = `
            @keyframes cartoon-pop {
              0% { transform: scale(0.7); opacity: 0; }
              80% { transform: scale(1.1); opacity: 1; }
              100% { transform: scale(1); }
            }
            `;
            document.head.appendChild(style);
          }

          onState(state => {
            element.textContent = state.text || '';
          });

          return element;
        });
    }
}

window.NpcDialoguePanel = new NpcDialoguePanel();
window.NpcDialoguePanel.initialize(); 