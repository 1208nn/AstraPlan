const { createApp } = Vue;

createApp({
    data() {
        return {
            isAuthenticated: false,
            token: null,
            authView: 'login',
            currentView: 'chat',
            loading: false,
            loginForm: { username: '', password: '' },
            registerForm: { username: '', password: '', inviteCode: '' },
            passwordForm: { old: '', new: '' },
            aiConfigForm: { provider: 'openai', apiKey: '', baseUrl: '', model: '' },
            promptConfig: {
                default_location: '',
                default_duration: 60,
                default_reminder: 15,
                timezone: 'Asia/Shanghai',
                custom_instructions: ''
            },
            userProfile: null,
            chatHistory: [],
            currentMessage: '',
            selectedImage: null,
            selectedDataSource: 'ms',
            newInviteQuota: 30,
            inviteCodes: []
        };
    },
    mounted() {
        this.token = localStorage.getItem('token');
        if (this.token) {
            this.isAuthenticated = true;
            this.loadUserProfile();
            this.loadChatHistory();
        }

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js');
        }
    },
    methods: {
        async apiCall(endpoint, options = {}) {
            const headers = { 'Content-Type': 'application/json' };
            if (this.token) {
                headers['Authorization'] = `Bearer ${this.token}`;
            }

            const response = await fetch(`/api${endpoint}`, {
                ...options,
                headers: { ...headers, ...options.headers }
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Request failed');
            }
            return data;
        },

        async login() {
            try {
                this.loading = true;
                const data = await this.apiCall('/auth/login', {
                    method: 'POST',
                    body: JSON.stringify(this.loginForm)
                });

                this.token = data.token;
                localStorage.setItem('token', data.token);
                this.isAuthenticated = true;
                await this.loadUserProfile();
            } catch (error) {
                alert('登录失败: ' + error.message);
            } finally {
                this.loading = false;
            }
        },

        async register() {
            try {
                this.loading = true;
                const data = await this.apiCall('/auth/register', {
                    method: 'POST',
                    body: JSON.stringify(this.registerForm)
                });

                this.token = data.token;
                localStorage.setItem('token', data.token);
                this.isAuthenticated = true;
                await this.loadUserProfile();
            } catch (error) {
                alert('注册失败: ' + error.message);
            } finally {
                this.loading = false;
            }
        },

        async loginWithMS() {
            try {
                const data = await this.apiCall('/auth/ms/auth');
                window.location.href = data.url;
            } catch (error) {
                alert('微软登录失败: ' + error.message);
            }
        },

        logout() {
            this.token = null;
            this.isAuthenticated = false;
            localStorage.removeItem('token');
            this.chatHistory = [];
            localStorage.removeItem('chatHistory');
        },

        async loadUserProfile() {
            try {
                const data = await this.apiCall('/user/profile');
                this.userProfile = data.user;
                this.selectedDataSource = data.user.data_source;
                
                if (data.user.user_prompt_config) {
                    this.promptConfig = {
                        default_location: data.user.user_prompt_config.fixed_fields.default_location || '',
                        default_duration: data.user.user_prompt_config.fixed_fields.default_duration || 60,
                        default_reminder: data.user.user_prompt_config.fixed_fields.default_reminder || 15,
                        timezone: data.user.user_prompt_config.fixed_fields.timezone || 'Asia/Shanghai',
                        custom_instructions: data.user.user_prompt_config.custom_instructions || ''
                    };
                }
            } catch (error) {
                console.error('Failed to load profile:', error);
            }
        },

        async sendMessage() {
            if (!this.currentMessage.trim() && !this.selectedImage) return;

            const userMessage = {
                role: 'user',
                content: this.currentMessage,
                timestamp: Date.now()
            };

            this.chatHistory.push(userMessage);
            this.saveChatHistory();

            const messageToSend = this.currentMessage;
            const imageToSend = this.selectedImage;
            this.currentMessage = '';
            this.selectedImage = null;

            try {
                this.loading = true;
                this.scrollToBottom();

                let imageData = null;
                if (imageToSend) {
                    imageData = await this.fileToBase64(imageToSend);
                }

                const data = await this.apiCall('/chat', {
                    method: 'POST',
                    body: JSON.stringify({
                        message: messageToSend,
                        image: imageData,
                        history: this.chatHistory.slice(-10)
                    })
                });

                const assistantMessage = {
                    role: 'assistant',
                    content: data.response,
                    timestamp: Date.now()
                };

                this.chatHistory.push(assistantMessage);
                this.saveChatHistory();
                
                if (this.userProfile) {
                    this.userProfile.remaining_quota = data.remaining_quota;
                }
            } catch (error) {
                alert('发送失败: ' + error.message);
            } finally {
                this.loading = false;
                this.scrollToBottom();
            }
        },

        handleImageUpload(event) {
            const file = event.target.files[0];
            if (file) {
                this.selectedImage = file;
            }
        },

        clearImage() {
            this.selectedImage = null;
            if (this.$refs.imageInput) {
                this.$refs.imageInput.value = '';
            }
        },

        fileToBase64(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        },

        clearChat() {
            if (confirm('确定要清除所有聊天记录吗？')) {
                this.chatHistory = [];
                this.saveChatHistory();
            }
        },

        saveChatHistory() {
            localStorage.setItem('chatHistory', JSON.stringify(this.chatHistory));
        },

        loadChatHistory() {
            const saved = localStorage.getItem('chatHistory');
            if (saved) {
                this.chatHistory = JSON.parse(saved);
            }
        },

        scrollToBottom() {
            this.$nextTick(() => {
                const container = this.$refs.chatContainer;
                if (container) {
                    container.scrollTop = container.scrollHeight;
                }
            });
        },

        async changePassword() {
            try {
                await this.apiCall('/user/password', {
                    method: 'POST',
                    body: JSON.stringify({
                        oldPassword: this.passwordForm.old,
                        newPassword: this.passwordForm.new
                    })
                });
                alert('密码已更新');
                this.passwordForm = { old: '', new: '' };
            } catch (error) {
                alert('更新失败: ' + error.message);
            }
        },

        async saveAIConfig() {
            try {
                const config = {
                    provider: this.aiConfigForm.provider,
                    apiKey: this.aiConfigForm.apiKey,
                };

                if (this.aiConfigForm.provider === 'custom') {
                    config.baseUrl = this.aiConfigForm.baseUrl;
                    config.model = this.aiConfigForm.model;
                }

                await this.apiCall('/user/ai-config', {
                    method: 'POST',
                    body: JSON.stringify(config)
                });
                
                alert('AI配置已保存');
                await this.loadUserProfile();
            } catch (error) {
                alert('保存失败: ' + error.message);
            }
        },

        async savePromptConfig() {
            try {
                const config = {
                    fixed_fields: {
                        default_location: this.promptConfig.default_location,
                        default_duration: this.promptConfig.default_duration,
                        default_reminder: this.promptConfig.default_reminder,
                        timezone: this.promptConfig.timezone
                    },
                    custom_instructions: this.promptConfig.custom_instructions
                };

                await this.apiCall('/user/prompt-config', {
                    method: 'POST',
                    body: JSON.stringify(config)
                });
                
                alert('提示词配置已保存');
            } catch (error) {
                alert('保存失败: ' + error.message);
            }
        },

        async bindMSAccount() {
            await this.loginWithMS();
        },

        async unbindMSAccount() {
            if (confirm('确定要解绑微软账号吗？')) {
                try {
                    await this.apiCall('/user/ms-account', { method: 'DELETE' });
                    alert('已解绑');
                    await this.loadUserProfile();
                } catch (error) {
                    alert('解绑失败: ' + error.message);
                }
            }
        },

        async enableICS() {
            try {
                const data = await this.apiCall('/user/enable-ics', { method: 'POST' });
                alert('ICS订阅已启用');
                await this.loadUserProfile();
            } catch (error) {
                alert('启用失败: ' + error.message);
            }
        },

        async changeDataSource() {
            try {
                await this.apiCall('/user/data-source', {
                    method: 'POST',
                    body: JSON.stringify({ source: this.selectedDataSource })
                });
                alert('数据源已切换');
                await this.loadUserProfile();
            } catch (error) {
                alert('切换失败: ' + error.message);
                this.selectedDataSource = this.userProfile.data_source;
            }
        },

        async createInviteCode() {
            try {
                const data = await this.apiCall('/admin/invite-codes', {
                    method: 'POST',
                    body: JSON.stringify({ quota: this.newInviteQuota })
                });
                alert(`邀请码已创建: ${data.code}`);
                await this.loadInviteCodes();
            } catch (error) {
                alert('创建失败: ' + error.message);
            }
        },

        async loadInviteCodes() {
            try {
                const data = await this.apiCall('/admin/invite-codes');
                this.inviteCodes = data.codes;
            } catch (error) {
                console.error('Failed to load invite codes:', error);
            }
        },

        async updateInviteQuota(code) {
            try {
                await this.apiCall(`/admin/invite-codes/${code.invite_code}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ quota: code.remaining_quota })
                });
            } catch (error) {
                alert('更新失败: ' + error.message);
            }
        },

        async disableInviteCode(inviteCode) {
            if (confirm('确定要停用此邀请码吗？')) {
                try {
                    await this.apiCall(`/admin/invite-codes/${inviteCode}`, {
                        method: 'DELETE'
                    });
                    await this.loadInviteCodes();
                } catch (error) {
                    alert('停用失败: ' + error.message);
                }
            }
        }
    },

    watch: {
        currentView(newView) {
            if (newView === 'admin') {
                this.loadInviteCodes();
            }
        }
    }
}).mount('#app');
