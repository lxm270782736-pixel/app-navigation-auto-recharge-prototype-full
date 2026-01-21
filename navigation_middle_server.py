#!/usr/bin/env python3
"""
独立的导航配置HTTP服务器
用于保存和加载导航配置到本地文件系统
"""

import asyncio
import json
import os
from pathlib import Path
from aiohttp import web

# 导航配置存储目录
NAV_CONFIG_DIR = Path(__file__).parent / "saved_nav_configs"
NAV_CONFIG_DIR.mkdir(exist_ok=True)
NAV_CONFIG_FILE = NAV_CONFIG_DIR / "navigation_config.json"


class NavigationConfigHandler:
    """HTTP API 处理导航配置存储"""

    async def get_config(self, request):
        """获取导航配置"""
        try:
            if not NAV_CONFIG_FILE.exists():
                return web.json_response({'success': False, 'message': '配置不存在'}, status=404)

            with open(NAV_CONFIG_FILE, 'r', encoding='utf-8') as f:
                config = json.load(f)
                return web.json_response({'success': True, 'data': config})
        except Exception as e:
            print(f"✗ 读取导航配置失败: {e}")
            return web.json_response({'success': False, 'error': str(e)}, status=500)

    async def save_config(self, request):
        """保存导航配置"""
        try:
            data = await request.json()
            config = data.get('config', {})

            # 保存配置到文件
            with open(NAV_CONFIG_FILE, 'w', encoding='utf-8') as f:
                json.dump(config, f, ensure_ascii=False, indent=2)

            print(f"✓ 导航配置已保存到: {NAV_CONFIG_FILE}")
            return web.json_response({'success': True, 'message': '导航配置已保存'})
        except Exception as e:
            print(f"✗ 保存导航配置失败: {e}")
            return web.json_response({'success': False, 'error': str(e)}, status=500)

    async def delete_config(self, request):
        """删除导航配置"""
        try:
            if NAV_CONFIG_FILE.exists():
                os.remove(NAV_CONFIG_FILE)
                print(f"✓ 导航配置已删除")
                return web.json_response({'success': True, 'message': '导航配置已删除'})
            else:
                return web.json_response({'success': False, 'message': '配置不存在'}, status=404)
        except Exception as e:
            print(f"✗ 删除导航配置失败: {e}")
            return web.json_response({'success': False, 'error': str(e)}, status=500)

    async def check_config(self, request):
        """检查配置是否存在"""
        try:
            exists = NAV_CONFIG_FILE.exists()
            return web.json_response({'success': True, 'exists': exists})
        except Exception as e:
            print(f"✗ 检查导航配置失败: {e}")
            return web.json_response({'success': False, 'error': str(e)}, status=500)


async def create_app():
    """创建并配置HTTP服务器"""
    app = web.Application()
    handler = NavigationConfigHandler()

    # 配置路由
    app.router.add_get('/api/navigation-config', handler.get_config)
    app.router.add_post('/api/navigation-config', handler.save_config)
    app.router.add_delete('/api/navigation-config', handler.delete_config)
    app.router.add_get('/api/navigation-config/check', handler.check_config)

    # 启用 CORS
    async def cors_middleware(app, handler):
        async def middleware_handler(request):
            if request.method == 'OPTIONS':
                return web.Response(
                    headers={
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type',
                    }
                )
            response = await handler(request)
            response.headers['Access-Control-Allow-Origin'] = '*'
            return response
        return middleware_handler

    app.middlewares.append(cors_middleware)

    return app


async def main():
    """启动服务器"""
    print("=" * 60)
    print("导航配置 HTTP API 服务器")
    print("=" * 60)
    print()
    print("API 端点:")
    print("  GET    /api/navigation-config       - 获取导航配置")
    print("  POST   /api/navigation-config       - 保存导航配置")
    print("  DELETE /api/navigation-config       - 删除导航配置")
    print("  GET    /api/navigation-config/check - 检查配置是否存在")
    print()
    print(f"配置存储位置: {NAV_CONFIG_DIR.absolute()}")
    print()
    print("访问地址: http://localhost:8081")
    print("=" * 60)
    print("按 Ctrl+C 停止服务器")
    print()

    app = await create_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, 'localhost', 8081)
    await site.start()

    print("✓ 导航配置服务器已启动 (http://localhost:8081)")

    # 永久运行
    await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n服务器已停止")
