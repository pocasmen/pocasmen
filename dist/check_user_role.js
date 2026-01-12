"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceKey);
function checkUserRoles() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Checking user roles in auth.users...\n');
        const { data: { users }, error } = yield supabase.auth.admin.listUsers();
        if (error) {
            console.error('Error fetching users:', error);
            return;
        }
        console.log('Admin and Super Admin users:');
        console.log('='.repeat(80));
        users
            .filter(u => {
            var _a;
            const role = (_a = u.user_metadata) === null || _a === void 0 ? void 0 : _a.role;
            return role === 'admin' || role === 'super_admin';
        })
            .forEach(u => {
            var _a, _b, _c;
            console.log(`Email: ${u.email}`);
            console.log(`Role: ${(_a = u.user_metadata) === null || _a === void 0 ? void 0 : _a.role}`);
            console.log(`First Name: ${((_b = u.user_metadata) === null || _b === void 0 ? void 0 : _b.first_name) || 'N/A'}`);
            console.log(`Last Name: ${((_c = u.user_metadata) === null || _c === void 0 ? void 0 : _c.last_name) || 'N/A'}`);
            console.log(`User ID: ${u.id}`);
            console.log('-'.repeat(80));
        });
        console.log('\nAll users with roles:');
        console.log('='.repeat(80));
        users.forEach(u => {
            var _a;
            console.log(`${u.email} -> ${((_a = u.user_metadata) === null || _a === void 0 ? void 0 : _a.role) || 'NO ROLE'}`);
        });
    });
}
checkUserRoles().then(() => process.exit(0));
