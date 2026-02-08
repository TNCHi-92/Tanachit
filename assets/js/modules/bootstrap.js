// Close modals when clicking outside
        document.getElementById('customerModal').addEventListener('click', (e) => {
            if (e.target.id === 'customerModal') {
                closeCustomerModal();
            }
        });

        document.getElementById('reportModal').addEventListener('click', (e) => {
            if (e.target.id === 'reportModal') {
                closeReportModal();
            }
        });

        document.getElementById('manageModal').addEventListener('click', (e) => {
            if (e.target.id === 'manageModal') {
                closeManageModal();
            }
        });

        // Initialize on page load
        init();
