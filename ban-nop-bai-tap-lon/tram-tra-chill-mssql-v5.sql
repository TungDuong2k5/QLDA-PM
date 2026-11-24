/* =====================================================================
 *  TRẠM TRÀ CHILL – SQL Server (T-SQL)
 *  Lược đồ CSDL theo ỨNG DỤNG HIỆN TẠI: 21 bảng.
 *  Sinh tự động từ các mô hình Sequelize của dự án (server/src/models) ngày 23/11/2026.
 *  Khác bản cũ: không còn bảng lương / link chia sẻ; thêm employees (PIN), employee_shifts (lịch),
 *  time_logs (chấm công thật), checkin_reminders (nhắc quản lý), stock_checks + stock_check_items (kiểm kho).
 *
 *  Quy ước chuyển đổi từ SQLite/Sequelize:
 *    ENUM -> NVARCHAR(30) + CHECK ; BOOLEAN -> BIT ; JSON -> NVARCHAR(MAX) + CHECK ISJSON
 *    DATE -> DATETIME2(0) ; DATEONLY -> DATE ; STRING -> NVARCHAR(255) ; TEXT -> NVARCHAR(MAX)
 *    createdAt / updatedAt: cột thời gian tạo / sửa (mặc định giờ hiện tại, ứng dụng tự cập nhật updatedAt)
 * ===================================================================== */

IF DB_ID(N'TramTraChill') IS NULL
    CREATE DATABASE [TramTraChill] COLLATE Vietnamese_100_CI_AS;
GO
USE [TramTraChill];
GO

/* ---- Xóa bảng cũ (con trước, cha sau) nếu chạy lại ---- */
IF OBJECT_ID(N'dbo.order_items', N'U') IS NOT NULL DROP TABLE dbo.[order_items];
IF OBJECT_ID(N'dbo.stock_check_items', N'U') IS NOT NULL DROP TABLE dbo.[stock_check_items];
IF OBJECT_ID(N'dbo.shift_expenses', N'U') IS NOT NULL DROP TABLE dbo.[shift_expenses];
IF OBJECT_ID(N'dbo.orders', N'U') IS NOT NULL DROP TABLE dbo.[orders];
IF OBJECT_ID(N'dbo.stock_checks', N'U') IS NOT NULL DROP TABLE dbo.[stock_checks];
IF OBJECT_ID(N'dbo.shifts', N'U') IS NOT NULL DROP TABLE dbo.[shifts];
IF OBJECT_ID(N'dbo.product_notices', N'U') IS NOT NULL DROP TABLE dbo.[product_notices];
IF OBJECT_ID(N'dbo.product_movements', N'U') IS NOT NULL DROP TABLE dbo.[product_movements];
IF OBJECT_ID(N'dbo.product_ingredients', N'U') IS NOT NULL DROP TABLE dbo.[product_ingredients];
IF OBJECT_ID(N'dbo.ingredient_movements', N'U') IS NOT NULL DROP TABLE dbo.[ingredient_movements];
IF OBJECT_ID(N'dbo.employee_shifts', N'U') IS NOT NULL DROP TABLE dbo.[employee_shifts];
IF OBJECT_ID(N'dbo.checkin_reminders', N'U') IS NOT NULL DROP TABLE dbo.[checkin_reminders];
IF OBJECT_ID(N'dbo.users', N'U') IS NOT NULL DROP TABLE dbo.[users];
IF OBJECT_ID(N'dbo.toppings', N'U') IS NOT NULL DROP TABLE dbo.[toppings];
IF OBJECT_ID(N'dbo.time_logs', N'U') IS NOT NULL DROP TABLE dbo.[time_logs];
IF OBJECT_ID(N'dbo.tables', N'U') IS NOT NULL DROP TABLE dbo.[tables];
IF OBJECT_ID(N'dbo.products', N'U') IS NOT NULL DROP TABLE dbo.[products];
IF OBJECT_ID(N'dbo.ingredients', N'U') IS NOT NULL DROP TABLE dbo.[ingredients];
IF OBJECT_ID(N'dbo.employees', N'U') IS NOT NULL DROP TABLE dbo.[employees];
IF OBJECT_ID(N'dbo.customers', N'U') IS NOT NULL DROP TABLE dbo.[customers];
IF OBJECT_ID(N'dbo.categories', N'U') IS NOT NULL DROP TABLE dbo.[categories];
GO

/* 1. categories */
CREATE TABLE dbo.[categories] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [name] NVARCHAR(255) NOT NULL,
    [isDrink] BIT NOT NULL CONSTRAINT [DF_categories_isDrink] DEFAULT 1,
    [imageUrl] NVARCHAR(255) NULL,
    [createdAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_categories_createdAt] DEFAULT SYSDATETIME(),
    [updatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_categories_updatedAt] DEFAULT SYSDATETIME(),
    CONSTRAINT [PK_categories] PRIMARY KEY ([id]),
    CONSTRAINT [UQ_categories_name] UNIQUE ([name])
);
GO

/* 2. customers */
CREATE TABLE dbo.[customers] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [phone] NVARCHAR(255) NOT NULL,
    [name] NVARCHAR(255) NOT NULL,
    [points] INT NOT NULL CONSTRAINT [DF_customers_points] DEFAULT 0,
    [createdAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_customers_createdAt] DEFAULT SYSDATETIME(),
    [updatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_customers_updatedAt] DEFAULT SYSDATETIME(),
    CONSTRAINT [PK_customers] PRIMARY KEY ([id]),
    CONSTRAINT [UQ_customers_phone] UNIQUE ([phone])
);
GO

/* 3. employees */
CREATE TABLE dbo.[employees] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [fullName] NVARCHAR(255) NOT NULL,
    [phone] NVARCHAR(255) NULL,
    [startDate] DATE NULL,
    [isActive] BIT NOT NULL CONSTRAINT [DF_employees_isActive] DEFAULT 1,
    [pinHash] NVARCHAR(255) NULL,
    [createdAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_employees_createdAt] DEFAULT SYSDATETIME(),
    [updatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_employees_updatedAt] DEFAULT SYSDATETIME(),
    CONSTRAINT [PK_employees] PRIMARY KEY ([id])
);
GO

/* 4. ingredients */
CREATE TABLE dbo.[ingredients] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [name] NVARCHAR(255) NOT NULL,
    [unit] NVARCHAR(255) NOT NULL CONSTRAINT [DF_ingredients_unit] DEFAULT N'kg',
    [stock] FLOAT NOT NULL CONSTRAINT [DF_ingredients_stock] DEFAULT 0,
    [createdAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ingredients_createdAt] DEFAULT SYSDATETIME(),
    [updatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ingredients_updatedAt] DEFAULT SYSDATETIME(),
    CONSTRAINT [PK_ingredients] PRIMARY KEY ([id]),
    CONSTRAINT [UQ_ingredients_name] UNIQUE ([name])
);
GO

/* 5. products */
CREATE TABLE dbo.[products] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [name] NVARCHAR(255) NOT NULL,
    [price] FLOAT NOT NULL,
    [imageUrl] NVARCHAR(255) NULL,
    [description] NVARCHAR(MAX) NULL,
    [isAvailable] BIT NOT NULL CONSTRAINT [DF_products_isAvailable] DEFAULT 1,
    [stock] INT NULL,
    [categoryId] INT NULL,
    [createdAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_products_createdAt] DEFAULT SYSDATETIME(),
    [updatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_products_updatedAt] DEFAULT SYSDATETIME(),
    CONSTRAINT [PK_products] PRIMARY KEY ([id]),
    CONSTRAINT [FK_products_categoryId] FOREIGN KEY ([categoryId]) REFERENCES dbo.[categories]([id]) ON DELETE SET NULL
);
GO

/* 6. tables */
CREATE TABLE dbo.[tables] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [name] NVARCHAR(255) NOT NULL,
    [capacity] INT NOT NULL CONSTRAINT [DF_tables_capacity] DEFAULT 4,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_tables_status] DEFAULT N'available',
    [createdAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_tables_createdAt] DEFAULT SYSDATETIME(),
    [updatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_tables_updatedAt] DEFAULT SYSDATETIME(),
    CONSTRAINT [PK_tables] PRIMARY KEY ([id]),
    CONSTRAINT [UQ_tables_name] UNIQUE ([name]),
    CONSTRAINT [CK_tables_status] CHECK ([status] IS NULL OR [status] IN (N'available', N'occupied'))
);
GO

/* 7. time_logs */
CREATE TABLE dbo.[time_logs] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [employeeId] INT NOT NULL,
    [workDate] DATE NOT NULL,
    [slot] NVARCHAR(30) NOT NULL,
    [checkInAt] DATETIME2(0) NOT NULL,
    [checkOutAt] DATETIME2(0) NULL,
    [lateMinutes] INT NOT NULL CONSTRAINT [DF_time_logs_lateMinutes] DEFAULT 0,
    [latePenalty] FLOAT NOT NULL CONSTRAINT [DF_time_logs_latePenalty] DEFAULT 0,
    [autoMarked] BIT NOT NULL CONSTRAINT [DF_time_logs_autoMarked] DEFAULT 1,
    [createdAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_time_logs_createdAt] DEFAULT SYSDATETIME(),
    [updatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_time_logs_updatedAt] DEFAULT SYSDATETIME(),
    CONSTRAINT [PK_time_logs] PRIMARY KEY ([id]),
    CONSTRAINT [CK_time_logs_slot] CHECK ([slot] IS NULL OR [slot] IN (N'morning', N'afternoon', N'evening')),
    CONSTRAINT [UQ_time_logs_employeeId_workDate_slot] UNIQUE ([employeeId], [workDate], [slot]),
    CONSTRAINT [FK_time_logs_employeeId] FOREIGN KEY ([employeeId]) REFERENCES dbo.[employees]([id]) ON DELETE CASCADE
);
GO

/* 8. toppings */
CREATE TABLE dbo.[toppings] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [name] NVARCHAR(255) NOT NULL,
    [price] FLOAT NOT NULL CONSTRAINT [DF_toppings_price] DEFAULT 0,
    [isAvailable] BIT NOT NULL CONSTRAINT [DF_toppings_isAvailable] DEFAULT 1,
    [stock] INT NULL,
    [createdAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_toppings_createdAt] DEFAULT SYSDATETIME(),
    [updatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_toppings_updatedAt] DEFAULT SYSDATETIME(),
    CONSTRAINT [PK_toppings] PRIMARY KEY ([id])
);
GO

/* 9. users */
CREATE TABLE dbo.[users] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [fullName] NVARCHAR(255) NOT NULL,
    [username] NVARCHAR(255) NOT NULL,
    [password] NVARCHAR(255) NOT NULL,
    [role] NVARCHAR(30) NOT NULL CONSTRAINT [DF_users_role] DEFAULT N'staff',
    [isActive] BIT NOT NULL CONSTRAINT [DF_users_isActive] DEFAULT 1,
    [createdAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_users_createdAt] DEFAULT SYSDATETIME(),
    [updatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_users_updatedAt] DEFAULT SYSDATETIME(),
    CONSTRAINT [PK_users] PRIMARY KEY ([id]),
    CONSTRAINT [UQ_users_username] UNIQUE ([username]),
    CONSTRAINT [CK_users_role] CHECK ([role] IS NULL OR [role] IN (N'admin', N'staff', N'employee'))
);
GO

/* 10. checkin_reminders */
CREATE TABLE dbo.[checkin_reminders] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [employeeId] INT NOT NULL,
    [workDate] DATE NOT NULL,
    [slot] NVARCHAR(30) NOT NULL,
    [resolvedAt] DATETIME2(0) NULL,
    [createdAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_checkin_reminders_createdAt] DEFAULT SYSDATETIME(),
    [updatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_checkin_reminders_updatedAt] DEFAULT SYSDATETIME(),
    CONSTRAINT [PK_checkin_reminders] PRIMARY KEY ([id]),
    CONSTRAINT [CK_checkin_reminders_slot] CHECK ([slot] IS NULL OR [slot] IN (N'morning', N'afternoon', N'evening')),
    CONSTRAINT [UQ_checkin_reminders_employeeId_workDate_slot] UNIQUE ([employeeId], [workDate], [slot]),
    CONSTRAINT [FK_checkin_reminders_employeeId] FOREIGN KEY ([employeeId]) REFERENCES dbo.[employees]([id]) ON DELETE CASCADE
);
GO

/* 11. employee_shifts */
CREATE TABLE dbo.[employee_shifts] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [employeeId] INT NOT NULL,
    [workDate] DATE NOT NULL,
    [slot] NVARCHAR(30) NOT NULL,
    [createdAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_employee_shifts_createdAt] DEFAULT SYSDATETIME(),
    [updatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_employee_shifts_updatedAt] DEFAULT SYSDATETIME(),
    CONSTRAINT [PK_employee_shifts] PRIMARY KEY ([id]),
    CONSTRAINT [CK_employee_shifts_slot] CHECK ([slot] IS NULL OR [slot] IN (N'morning', N'afternoon', N'evening')),
    CONSTRAINT [UQ_employee_shifts_employeeId_workDate_slot] UNIQUE ([employeeId], [workDate], [slot]),
    CONSTRAINT [FK_employee_shifts_employeeId] FOREIGN KEY ([employeeId]) REFERENCES dbo.[employees]([id]) ON DELETE CASCADE
);
GO

/* 12. ingredient_movements */
CREATE TABLE dbo.[ingredient_movements] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [type] NVARCHAR(30) NOT NULL,
    [quantity] FLOAT NOT NULL,
    [note] NVARCHAR(255) NULL,
    [ingredientId] INT NULL,
    [userId] INT NULL,
    [createdAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ingredient_movements_createdAt] DEFAULT SYSDATETIME(),
    [updatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_ingredient_movements_updatedAt] DEFAULT SYSDATETIME(),
    CONSTRAINT [PK_ingredient_movements] PRIMARY KEY ([id]),
    CONSTRAINT [CK_ingredient_movements_type] CHECK ([type] IS NULL OR [type] IN (N'in', N'out')),
    CONSTRAINT [FK_ingredient_movements_ingredientId] FOREIGN KEY ([ingredientId]) REFERENCES dbo.[ingredients]([id]) ON DELETE CASCADE,
    CONSTRAINT [FK_ingredient_movements_userId] FOREIGN KEY ([userId]) REFERENCES dbo.[users]([id]) ON DELETE SET NULL
);
GO

/* 13. product_ingredients */
CREATE TABLE dbo.[product_ingredients] (
    [productId] INT NOT NULL,
    [ingredientId] INT NOT NULL,
    [createdAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_product_ingredients_createdAt] DEFAULT SYSDATETIME(),
    [updatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_product_ingredients_updatedAt] DEFAULT SYSDATETIME(),
    CONSTRAINT [PK_product_ingredients] PRIMARY KEY ([productId], [ingredientId]),
    CONSTRAINT [FK_product_ingredients_productId] FOREIGN KEY ([productId]) REFERENCES dbo.[products]([id]) ON DELETE CASCADE,
    CONSTRAINT [FK_product_ingredients_ingredientId] FOREIGN KEY ([ingredientId]) REFERENCES dbo.[ingredients]([id]) ON DELETE CASCADE
);
GO

/* 14. product_movements */
CREATE TABLE dbo.[product_movements] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [type] NVARCHAR(30) NOT NULL,
    [quantity] FLOAT NOT NULL,
    [note] NVARCHAR(255) NULL,
    [productId] INT NULL,
    [userId] INT NULL,
    [createdAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_product_movements_createdAt] DEFAULT SYSDATETIME(),
    [updatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_product_movements_updatedAt] DEFAULT SYSDATETIME(),
    CONSTRAINT [PK_product_movements] PRIMARY KEY ([id]),
    CONSTRAINT [CK_product_movements_type] CHECK ([type] IS NULL OR [type] IN (N'in', N'out')),
    CONSTRAINT [FK_product_movements_productId] FOREIGN KEY ([productId]) REFERENCES dbo.[products]([id]) ON DELETE CASCADE,
    CONSTRAINT [FK_product_movements_userId] FOREIGN KEY ([userId]) REFERENCES dbo.[users]([id]) ON DELETE SET NULL
);
GO

/* 15. product_notices */
CREATE TABLE dbo.[product_notices] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [productId] INT NOT NULL,
    [kind] NVARCHAR(30) NOT NULL,
    [requestedByUserId] INT NULL,
    [createdAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_product_notices_createdAt] DEFAULT SYSDATETIME(),
    [updatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_product_notices_updatedAt] DEFAULT SYSDATETIME(),
    CONSTRAINT [PK_product_notices] PRIMARY KEY ([id]),
    CONSTRAINT [UQ_product_notices_productId] UNIQUE ([productId]),
    CONSTRAINT [CK_product_notices_kind] CHECK ([kind] IS NULL OR [kind] IN (N'close_request', N'reopen_request', N'closed_for_stock')),
    CONSTRAINT [FK_product_notices_productId] FOREIGN KEY ([productId]) REFERENCES dbo.[products]([id]) ON DELETE CASCADE
);
GO

/* 16. shifts */
CREATE TABLE dbo.[shifts] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [sequence] INT NOT NULL,
    [businessDate] DATE NOT NULL,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_shifts_status] DEFAULT N'open',
    [openedAt] DATETIME2(0) NOT NULL,
    [closedAt] DATETIME2(0) NULL,
    [openingCash] FLOAT NOT NULL CONSTRAINT [DF_shifts_openingCash] DEFAULT 0,
    [openedByUserId] INT NULL,
    [createdAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_shifts_createdAt] DEFAULT SYSDATETIME(),
    [updatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_shifts_updatedAt] DEFAULT SYSDATETIME(),
    CONSTRAINT [PK_shifts] PRIMARY KEY ([id]),
    CONSTRAINT [CK_shifts_status] CHECK ([status] IS NULL OR [status] IN (N'open', N'closed')),
    CONSTRAINT [FK_shifts_openedByUserId] FOREIGN KEY ([openedByUserId]) REFERENCES dbo.[users]([id]) ON DELETE SET NULL
);
GO

/* 17. stock_checks */
CREATE TABLE dbo.[stock_checks] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [businessDate] DATE NOT NULL,
    [slot] NVARCHAR(30) NOT NULL CONSTRAINT [DF_stock_checks_slot] DEFAULT N'morning',
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_stock_checks_status] DEFAULT N'submitted',
    [submittedByUserId] INT NULL,
    [submittedAt] DATETIME2(0) NOT NULL,
    [note] NVARCHAR(255) NULL,
    [reviewedByUserId] INT NULL,
    [reviewedAt] DATETIME2(0) NULL,
    [reviewNote] NVARCHAR(255) NULL,
    [applied] BIT NOT NULL CONSTRAINT [DF_stock_checks_applied] DEFAULT 0,
    [createdAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_stock_checks_createdAt] DEFAULT SYSDATETIME(),
    [updatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_stock_checks_updatedAt] DEFAULT SYSDATETIME(),
    CONSTRAINT [PK_stock_checks] PRIMARY KEY ([id]),
    CONSTRAINT [UQ_stock_checks_businessDate_slot] UNIQUE ([businessDate], [slot]),
    CONSTRAINT [CK_stock_checks_slot] CHECK ([slot] IS NULL OR [slot] IN (N'morning', N'afternoon', N'evening')),
    CONSTRAINT [CK_stock_checks_status] CHECK ([status] IS NULL OR [status] IN (N'submitted', N'approved', N'rejected')),
    CONSTRAINT [FK_stock_checks_submittedByUserId] FOREIGN KEY ([submittedByUserId]) REFERENCES dbo.[users]([id]) ON DELETE SET NULL,
    CONSTRAINT [FK_stock_checks_reviewedByUserId] FOREIGN KEY ([reviewedByUserId]) REFERENCES dbo.[users]([id]) ON DELETE NO ACTION
);
GO

/* 18. orders */
CREATE TABLE dbo.[orders] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_orders_status] DEFAULT N'pending',
    [orderType] NVARCHAR(30) NOT NULL CONSTRAINT [DF_orders_orderType] DEFAULT N'dine_in',
    [total] FLOAT NOT NULL CONSTRAINT [DF_orders_total] DEFAULT 0,
    [note] NVARCHAR(255) NULL,
    [paymentMethod] NVARCHAR(30) NULL,
    [pointsUsed] INT NOT NULL CONSTRAINT [DF_orders_pointsUsed] DEFAULT 0,
    [pointsEarned] INT NOT NULL CONSTRAINT [DF_orders_pointsEarned] DEFAULT 0,
    [tableId] INT NULL,
    [userId] INT NULL,
    [customerId] INT NULL,
    [shiftId] INT NULL,
    [createdAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_orders_createdAt] DEFAULT SYSDATETIME(),
    [updatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_orders_updatedAt] DEFAULT SYSDATETIME(),
    CONSTRAINT [PK_orders] PRIMARY KEY ([id]),
    CONSTRAINT [CK_orders_status] CHECK ([status] IS NULL OR [status] IN (N'pending', N'preparing', N'served', N'paid', N'cancelled')),
    CONSTRAINT [CK_orders_orderType] CHECK ([orderType] IS NULL OR [orderType] IN (N'dine_in', N'takeaway')),
    CONSTRAINT [CK_orders_paymentMethod] CHECK ([paymentMethod] IS NULL OR [paymentMethod] IN (N'cash', N'bank_transfer', N'momo', N'zalopay')),
    CONSTRAINT [FK_orders_tableId] FOREIGN KEY ([tableId]) REFERENCES dbo.[tables]([id]) ON DELETE SET NULL,
    CONSTRAINT [FK_orders_userId] FOREIGN KEY ([userId]) REFERENCES dbo.[users]([id]) ON DELETE SET NULL,
    CONSTRAINT [FK_orders_customerId] FOREIGN KEY ([customerId]) REFERENCES dbo.[customers]([id]) ON DELETE SET NULL,
    CONSTRAINT [FK_orders_shiftId] FOREIGN KEY ([shiftId]) REFERENCES dbo.[shifts]([id]) ON DELETE NO ACTION
);
GO

/* 19. shift_expenses */
CREATE TABLE dbo.[shift_expenses] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [amount] FLOAT NOT NULL,
    [note] NVARCHAR(255) NOT NULL,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_shift_expenses_status] DEFAULT N'pending',
    [approvedAt] DATETIME2(0) NULL,
    [shiftId] INT NULL,
    [userId] INT NULL,
    [approvedByUserId] INT NULL,
    [createdAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_shift_expenses_createdAt] DEFAULT SYSDATETIME(),
    [updatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_shift_expenses_updatedAt] DEFAULT SYSDATETIME(),
    CONSTRAINT [PK_shift_expenses] PRIMARY KEY ([id]),
    CONSTRAINT [CK_shift_expenses_status] CHECK ([status] IS NULL OR [status] IN (N'pending', N'approved', N'rejected')),
    CONSTRAINT [FK_shift_expenses_shiftId] FOREIGN KEY ([shiftId]) REFERENCES dbo.[shifts]([id]) ON DELETE CASCADE,
    CONSTRAINT [FK_shift_expenses_userId] FOREIGN KEY ([userId]) REFERENCES dbo.[users]([id]) ON DELETE NO ACTION,
    CONSTRAINT [FK_shift_expenses_approvedByUserId] FOREIGN KEY ([approvedByUserId]) REFERENCES dbo.[users]([id]) ON DELETE NO ACTION
);
GO

/* 20. stock_check_items */
CREATE TABLE dbo.[stock_check_items] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [kind] NVARCHAR(30) NOT NULL,
    [refId] INT NOT NULL,
    [name] NVARCHAR(255) NOT NULL,
    [unit] NVARCHAR(255) NULL,
    [systemQty] FLOAT NOT NULL,
    [countedQty] FLOAT NOT NULL,
    [soldQty] FLOAT NOT NULL CONSTRAINT [DF_stock_check_items_soldQty] DEFAULT 0,
    [stockCheckId] INT NULL,
    CONSTRAINT [PK_stock_check_items] PRIMARY KEY ([id]),
    CONSTRAINT [CK_stock_check_items_kind] CHECK ([kind] IS NULL OR [kind] IN (N'ingredient', N'product')),
    CONSTRAINT [FK_stock_check_items_stockCheckId] FOREIGN KEY ([stockCheckId]) REFERENCES dbo.[stock_checks]([id]) ON DELETE CASCADE
);
GO

/* 21. order_items */
CREATE TABLE dbo.[order_items] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [quantity] INT NOT NULL CONSTRAINT [DF_order_items_quantity] DEFAULT 1,
    [unitPrice] FLOAT NOT NULL,
    [sugarLevel] INT NOT NULL CONSTRAINT [DF_order_items_sugarLevel] DEFAULT 100,
    [iceLevel] INT NOT NULL CONSTRAINT [DF_order_items_iceLevel] DEFAULT 100,
    [toppings] NVARCHAR(MAX) NOT NULL CONSTRAINT [DF_order_items_toppings] DEFAULT N'[]',
    [toppingsPrice] FLOAT NOT NULL CONSTRAINT [DF_order_items_toppingsPrice] DEFAULT 0,
    [size] NVARCHAR(255) NULL,
    [sizeExtraPrice] FLOAT NOT NULL CONSTRAINT [DF_order_items_sizeExtraPrice] DEFAULT 0,
    [isRedeemed] BIT NOT NULL CONSTRAINT [DF_order_items_isRedeemed] DEFAULT 0,
    [toppingId] INT NULL,
    [orderId] INT NULL,
    [productId] INT NULL,
    [createdAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_order_items_createdAt] DEFAULT SYSDATETIME(),
    [updatedAt] DATETIME2(0) NOT NULL CONSTRAINT [DF_order_items_updatedAt] DEFAULT SYSDATETIME(),
    CONSTRAINT [PK_order_items] PRIMARY KEY ([id]),
    CONSTRAINT [CK_order_items_sugarLevel] CHECK ([sugarLevel] IS NULL OR [sugarLevel] IN (N'0', N'10', N'30', N'50', N'70', N'100')),
    CONSTRAINT [CK_order_items_iceLevel] CHECK ([iceLevel] IS NULL OR [iceLevel] IN (N'0', N'10', N'30', N'50', N'70', N'100')),
    CONSTRAINT [CK_order_items_toppings] CHECK ([toppings] IS NULL OR ISJSON([toppings]) = 1),
    CONSTRAINT [CK_order_items_size] CHECK ([size] IS NULL OR [size] IN (N'M', N'L')),
    CONSTRAINT [FK_order_items_toppingId] FOREIGN KEY ([toppingId]) REFERENCES dbo.[toppings]([id]) ON DELETE SET NULL,
    CONSTRAINT [FK_order_items_orderId] FOREIGN KEY ([orderId]) REFERENCES dbo.[orders]([id]) ON DELETE CASCADE,
    CONSTRAINT [FK_order_items_productId] FOREIGN KEY ([productId]) REFERENCES dbo.[products]([id]) ON DELETE SET NULL
);
GO

/* ---- Chỉ mục phục vụ truy vấn thường dùng ---- */
CREATE INDEX [IX_orders_createdAt] ON dbo.[orders]([createdAt]);
CREATE INDEX [IX_orders_shiftId] ON dbo.[orders]([shiftId]);
CREATE INDEX [IX_order_items_orderId] ON dbo.[order_items]([orderId]);
CREATE INDEX [IX_shifts_businessDate] ON dbo.[shifts]([businessDate]);
CREATE INDEX [IX_time_logs_workDate] ON dbo.[time_logs]([workDate]);
CREATE INDEX [IX_ingredient_movements_ing] ON dbo.[ingredient_movements]([ingredientId], [createdAt]);
CREATE INDEX [IX_product_movements_prod] ON dbo.[product_movements]([productId], [createdAt]);
GO

/* Ghi chú: SQL Server không cho phép nhiều đường xóa dây chuyền tới cùng một bảng, nên các khóa ngoại sau dùng
   NO ACTION thay cho hành động ban đầu của ứng dụng (ứng dụng tự xử lý khi xóa dữ liệu cha):
     - stock_checks.reviewedByUserId -> users (ban đầu SET NULL)
     - orders.shiftId -> shifts (ban đầu SET NULL)
     - shift_expenses.userId -> users (ban đầu SET NULL)
     - shift_expenses.approvedByUserId -> users (ban đầu SET NULL)
*/

/* ---- Kiểm tra nhanh ---- */
SELECT COUNT(*) AS so_bang FROM sys.tables WHERE schema_id = SCHEMA_ID('dbo');  -- mong đợi 21
SELECT t.name AS bang, COUNT(c.column_id) AS so_cot FROM sys.tables t JOIN sys.columns c ON c.object_id = t.object_id GROUP BY t.name ORDER BY t.name;
GO
