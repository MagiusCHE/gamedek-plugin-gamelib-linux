const fs = require("fs")
const path = require('path')
const rimraf = require("rimraf")

class myplugin extends global.Plugin {
    constructor(root, manifest) {
        super(root, manifest)
    }
    async init() {
        await super.init()
    }
    async getImportAction(actions) {
        actions['import.linux'] = {
            provider: 'gameengine',
            button: await kernel.translateBlock('${lang.ge_import_linux}'),
            short: await kernel.translateBlock('${lang.ge_import_linux_short}'),
            args: true
        }

        return actions
    }
    #activegames = {}
    async binExecutonTerminated(pid) {
        let hash
        for (const thash in this.#activegames) {
            if (this.#activegames[thash] == pid) {
                hash = thash
                break
            }
        }
        if (!hash) {
            return
        }

        const ret = (await kernel.broadcastPluginMethod('fileservice', 'getReturnsBinByPid', pid, true)).returns.last
        if (!ret) {
            return
        }
        await kernel.gameList.setGameStoppedByHash(hash, {
            error: ret?.returns?.exit?.error,
            stdcmd: ret?.returns?.exit?.log,
            stdout: ret?.returns?.exit?.std,
            stderr: ret?.returns?.exit?.err
        })
    }
    async forceCloseGameByHash(hash) {
        const games = await kernel.gameList.getGames()
        const game = games.find(g => g.hash == hash)
        if (!game || game.provider != 'import.linux') {
            return
        }

        return kernel.broadcastPluginMethod('fileservice', 'forceCloseBinByPid', this.#activegames[hash])
    }
    async startGameByHash(hash, returns) {
        returns = returns || {}
        if (returns.handled) {
            return returns
        }
        const games = await kernel.gameList.getGames()
        const game = games.find(g => g.hash == hash)
        if (!game) {
            returns.error = {
                title: await kernel.translateBlock('${lang.ge_com_filenotfound_title}'),
                message: await kernel.translateBlock('${lang.ge_com_filenotfound "' + 'hash' + '" "' + hash + '"}'),
            }
            return returns
        }

        if (game.provider != 'import.linux') {
            return returns
        }

        const args = {
            executable: game.props.executable.executable,
            env: { ...process.env, ...game.props.system?.env },
            detached: true,
            arguments: game.props.executable.arguments,
            cwd: game.props.executable.workdir && game.props.executable.workdir.length > 0 ? game.props.executable.workdir : path.dirname(game.props.executable.executable)
        }
        const ret = (await kernel.broadcastPluginMethod('fileservice', 'spawnBinOrScript', args)).returns.last

        if (ret.error) {
            await kernel.gameList.setGameStoppedByHash(hash, {
                error: ret.error,
                stdcmb: log.join('\n'),
                stdout: std.join('\n'),
                stderr: err.join('\n')
            })
        } else {
            this.#activegames[hash] = ret.pid
            await kernel.gameList.setGameStartedByHash(hash)
        }

        return returns
        /*
            const tmpworkdir = 
            const log = []
            const err = []
            let startupFinalize = async (error) => {
                startupFinalize = () => { }
                if (error) {
                    this.logError(error)
                    delete this.#activegames[hash]
                    await kernel.gameList.setGameStoppedByHash(hash, {
                        error: error,
                        std: log.join('\n'),
                        stderr: err.join('\n')
                    })
                } else {
                    await kernel.gameList.setGameStartedByHash(hash)
                }
                // Handle exit
                returns.exit = {
                    log: log.join('\n'),
                    err: err.join('\n')
                }

                if (error) {
                    returns.error = {
                        title: err_title,
                        message: err_msg
                    }
                }
                resolve(returns)
            }
            let finalize = async (code) => {
                finalize = () => { }
                delete this.#activegames[hash]
                await kernel.gameList.setGameStoppedByHash(hash, {
                    code: code,
                    std: log.join('\n'),
                    stderr: err.join('\n')
                })
            }

            const separatedargs =
                //separatedargs = game.props.executable.arguments.split(' ')

                let exec
            try {
                exec = spawn(
                    game.props.executable.executable
                    , separatedargs, {
                    cwd: tmpworkdir,
                    detached: true
                }
                );
                this.#activegames[hash] = exec
                startupFinalize()
            } catch (er) {
                startupFinalize(er)
                return
            }

            exec.on('error', (er) => {
                startupFinalize(er)
            })

            exec.stdout.on("data", (data) => {
                log.push(data)
            });

            exec.stderr.on("data", (er) => {
                // Handle error...
                log.push(er)
                err.push(er)
            });

            exec.on("exit", (code) => {
                finalize(code)
            });
        })*/
    }
    async updateGame(info, returns) {
        returns = returns || {}
        if (info.provider != 'import.linux') {
            return returns
        }
        if (returns.handled) {
            return returns
        }
        await kernel.gameList_updateGame(info)

        returns.handled = true

        return returns
    }
    async createNewGame(info, returns) {
        returns = returns || {}
        if (info.provider != 'import.linux') {
            return returns
        }
        if (returns.handled) {
            return returns
        }

        await kernel.gameList_addNewGame(info)

        returns.handled = true

        return returns
    }
    async confirmGameParams(info, returns) {
        if (info.provider != 'import.linux') {
            return returns
        }
        const props = info.props

        if (returns.error) {
            return returns
        }
        if (!props.executable.executable) {
            returns.error = {
                title: await kernel.translateBlock('${lang.ge_com_required_title}'),
                message: await kernel.translateBlock('${lang.ge_com_required "' + await kernel.translateBlock('${lang.ge_il_info_binary}') + '"}'),
            }
            returns.tab = 'executable'
            returns.item = 'executable'
        }
        if (!fs.existsSync(props.executable.executable) || !fs.statSync(props.executable.executable).isFile()) {
            returns.error = {
                title: await kernel.translateBlock('${lang.ge_com_filenotfound_title}'),
                message: await kernel.translateBlock('${lang.ge_com_filenotfound "' + await kernel.translateBlock('${lang.ge_il_info_binary}') + '" "' + props.executable.executable + '"}'),
            }
            returns.tab = 'executable'
            returns.item = 'executable'
        }

        return returns
    }
    async executeUninstallOf(hash, op, provider, returns) {
        if (!returns) {
            returns = {}
        }
        if (provider != 'gamelib.linux' || returns.success === false) {
            return returns
        }
        const games = await kernel.gameList.getGames()
        const game = games.find(g => g.hash == hash)
        if (!game) {
            returns.error = {
                title: await kernel.translateBlock('${lang.ge_com_filenotfound_title}'),
                message: await kernel.translateBlock('${lang.ge_com_filenotfound "' + 'hash' + '" "' + hash + '"}'),
            }
            return returns
        }
        if (game.provider != 'import.linux') {
            return returns
        }

        const securermrf = dir => {
            //this.log('rm -rf ' + dir)
            rimraf.sync(dir)
        }

        if (op == 'gu_rmrf_cmd' && fs.existsSync(game.props.executable.executable)) {
            securermrf(path.dirname(game.props.executable.executable))
        }
        if (op == 'gu_rmrf_cwd' && game.props.executable.workdir && game.props.executable.workdir.trim().length > 0 && fs.existsSync(game.props.executable.workdir)) {
            securermrf(game.props.executable.workdir)
        }

        returns.success = true
    }
    async querySwitchForUninstall(hash, returns) {
        if (!returns) {
            returns = {}
        }
        const games = await kernel.gameList.getGames()
        const game = games.find(g => g.hash == hash)
        if (!game) {
            returns.error = {
                title: await kernel.translateBlock('${lang.ge_com_filenotfound_title}'),
                message: await kernel.translateBlock('${lang.ge_com_filenotfound "' + 'hash' + '" "' + hash + '"}'),
            }
            return returns
        }

        if (game.provider != 'import.linux') {
            return returns
        }

        if (!returns.switches) {
            returns.switches = {}
        }

        //saecurelinux dir
        const lnxdirs = [
            '/usr/bin',
            '/usr/sbin',
            '/bin',
            '/sbin',
            '/'
        ]

        const isvaliddir = function(dir) {
            if (!dir || dir.length == 0 || !fs.existsSync(dir)) {
                return false
            }
            if (process.platform == "linux" || process.platform == "darwin") {
                if (lnxdirs.indexOf(dir.replace(/\/+$/g, '')) > -1) {
                    return false
                }
            }

            return true
        }
        let todel = path.dirname(game.props.executable.executable)
        if (isvaliddir(todel)) {
            returns.switches.gu_rmrf_cmd = {
                label: await kernel.translateBlock('${lang.ge_game_dialog_rmrf_cmd_switch} <span class="text-danger">' + todel + '</span>')
            }
        }
        if ((game.props.executable.workdir + '').replace(/\/+$/g, '') != todel.replace(/\/+$/g, '')) {
            todel = game.props.executable.workdir
            if (isvaliddir(todel)) {
                returns.switches.gu_rmrf_cwd = {
                    label: await kernel.translateBlock('${lang.ge_game_dialog_rmrf_cwd_switch} <span class="text-danger">' + todel + '</span>')
                }
            }
        }
        return returns
    }
    async queryInfoForGame(action, newargsinfo) {
        if (!newargsinfo) {
            newargsinfo = {}
        }
        if (!newargsinfo.tabs) {
            newargsinfo.tabs = {}
        }
        if (action != 'import.linux') {
            return newargsinfo
        }
        newargsinfo.tabs.executable = {
            order: "1"
            , title: await kernel.translateBlock('${lang.ge_il_info_tabexe}')
            , items: {
                executable: {
                    type: "file"
                    , filters: [
                        {
                            name: await kernel.translateBlock('${lang.ge_il_info_binary_flabel}')
                            , extensions: ['*']
                        }
                    ]
                    , label: await kernel.translateBlock('${lang.ge_il_info_binary}')
                    , required: true
                },
                arguments: {
                    type: "text"
                    , label: await kernel.translateBlock('${lang.ge_il_info_arguments}')
                },
                workdir: {
                    type: "folder"
                    , label: await kernel.translateBlock('${lang.ge_il_info_folder}')
                },
                cmdline: {
                    type: "readonly"
                    , when_oneitemvalue_changed: /*source*/`
                        if (source && source.attr('id') == 'executable_cmdline')
                            return
                        const envs = []
                        $('#system_env .setting_keyvalue').each(function(){
                            envs.push($(this).find('.label').val() + '=' + $(this).find('.value').val())
                        })
                        let newval =
                            'cd "' + $('#executable_workdir').val() + '"'
                            + ' && ' + envs.join(' ')
                            + ' "' + $('#executable_executable').val() + '"'
                            + ' ' + $('#executable_arguments').val()
                        $('#executable_cmdline').val(newval)
                    `
                    , label: await kernel.translateBlock('${lang.ge_il_info_cmdline}')
                }
            }
        }
        return newargsinfo;
    }
}

module.exports = myplugin
